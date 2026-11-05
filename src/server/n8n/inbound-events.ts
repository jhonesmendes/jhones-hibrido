import { asc, eq, lt } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import type { MessageLocation } from "@/server/inbox/location";

/**
 * Entrega ao n8n cada mensagem recebida, nas instâncias operadas por
 * automação: o Vocero recebe e grava; quem decide a resposta é o workflow,
 * que devolve pela API interna (`POST /api/internal/messages`).
 *
 * Fila em banco (`n8n_inbound_event`): n8n fora do ar ou container
 * reiniciando não perdem mensagem. A entrega é "pelo menos uma vez" — o
 * workflow deduplica por `eventId` se precisar.
 */

/** Espera ANTES da tentativa N+1 (índice = tentativas já feitas). */
export const RETRY_DELAYS_MS = [0, 30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
const DELIVERY_TIMEOUT_MS = 15_000;
const CYCLE_INTERVAL_MS = 15_000;
const CYCLE_BATCH = 50;

export function isDeliveryDue(attempts: number, lastAttemptAt: Date | null, now: Date): boolean {
  if (attempts >= RETRY_DELAYS_MS.length) return false;
  if (!lastAttemptAt) return true;
  return now.getTime() - lastAttemptAt.getTime() >= (RETRY_DELAYS_MS[attempts] ?? 0);
}

export type InboundWebhookView = { url: string | null; hasToken: boolean };

export async function getInboundWebhookView(organizationId: string): Promise<InboundWebhookView> {
  const rows = await getDb()
    .select({
      url: schema.n8nConfig.inboundWebhookUrl,
      tokenCipher: schema.n8nConfig.inboundTokenCipher,
    })
    .from(schema.n8nConfig)
    .where(eq(schema.n8nConfig.organizationId, organizationId))
    .limit(1);
  return { url: rows[0]?.url ?? null, hasToken: Boolean(rows[0]?.tokenCipher) };
}

/** Grava o webhook. `token` omitido mantém o atual; `null` remove. Devolve
 * false se o n8n ainda não foi configurado nesta organização. */
export async function saveInboundWebhook(
  organizationId: string,
  input: { url: string | null; token?: string | null }
): Promise<boolean> {
  const enc = input.token ? encryptSecret(input.token) : null;
  const clearsToken = input.url === null || input.token === null;
  const updated = await getDb()
    .update(schema.n8nConfig)
    .set({
      inboundWebhookUrl: input.url,
      ...(enc
        ? { inboundTokenCipher: enc.cipher, inboundTokenIv: enc.iv, inboundTokenTag: enc.tag }
        : clearsToken
          ? { inboundTokenCipher: null, inboundTokenIv: null, inboundTokenTag: null }
          : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.n8nConfig.organizationId, organizationId))
    .returning({ id: schema.n8nConfig.id });
  return updated.length > 0;
}

async function resolveInboundWebhook(
  organizationId: string
): Promise<{ url: string; token: string | null } | null> {
  const rows = await getDb()
    .select()
    .from(schema.n8nConfig)
    .where(eq(schema.n8nConfig.organizationId, organizationId))
    .limit(1);
  const row = rows[0];
  if (!row?.inboundWebhookUrl) return null;
  const token =
    row.inboundTokenCipher && row.inboundTokenIv && row.inboundTokenTag
      ? decryptSecret({
          cipher: row.inboundTokenCipher,
          iv: row.inboundTokenIv,
          tag: row.inboundTokenTag,
        })
      : null;
  return { url: row.inboundWebhookUrl, token };
}

/** true = o n8n responde as conversas desta organização (o agente de IA se
 * cala). Erro de leitura conta como false: nunca derruba a ingestão. */
export async function isInboundWebhookActive(organizationId: string): Promise<boolean> {
  try {
    return Boolean((await getInboundWebhookView(organizationId)).url);
  } catch (err) {
    console.error("[n8n] falha ao ler o webhook de entrada:", err);
    return false;
  }
}

export type InboundEventPayload = {
  event: "message.received";
  eventId: string;
  occurredAt: string;
  conversationId: string;
  channel: string;
  contact: { id: string; phone: string; name: string | null };
  message: {
    id: string;
    waMessageId: string | null;
    type: string;
    text: string | null;
    replyToMessageId: string | null;
    location: MessageLocation | null;
    media: {
      url: string;
      available: boolean;
      mimeType: string | null;
      filename: string | null;
      sizeBytes: number | null;
    } | null;
  };
};

export function buildInboundPayload(input: {
  baseUrl: string;
  message: typeof schema.message.$inferSelect;
  conversation: { id: string; channel: string };
  contact: { id: string; phone: string; name: string | null };
  media: { mimeType: string; filename: string | null; sizeBytes: number | null } | null;
}): InboundEventPayload {
  const { message: m, contact, conversation, media } = input;
  return {
    event: "message.received",
    eventId: m.id,
    occurredAt: (m.waTimestamp ?? m.createdAt).toISOString(),
    conversationId: conversation.id,
    channel: conversation.channel,
    contact: { id: contact.id, phone: contact.phone, name: contact.name },
    message: {
      id: m.id,
      waMessageId: m.waMessageId,
      type: m.type,
      text: m.text,
      replyToMessageId: m.replyToMessageId,
      location: m.location ?? null,
      media: m.mediaUrl
        ? {
            url: `${input.baseUrl.replace(/\/$/, "")}/api/internal/messages/${m.id}/media`,
            // false = download ainda em recuperação (ver media-recovery.ts).
            available: Boolean(media),
            mimeType: media?.mimeType ?? null,
            filename: media?.filename ?? null,
            sizeBytes: media?.sizeBytes ?? null,
          }
        : null,
    },
  };
}

export async function postToWebhook(
  webhook: { url: string; token: string | null },
  payload: unknown
): Promise<void> {
  const res = await fetch(webhook.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(webhook.token ? { "x-vocero-token": webhook.token } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });
  if (!res.ok) {
    const hint = res.status === 404 ? " (o workflow está ativo no n8n?)" : "";
    throw new Error(`O webhook respondeu ${res.status}${hint}`);
  }
}

/** Envia um evento de teste com a configuração salva, sem passar pela fila. */
export async function sendInboundTest(organizationId: string): Promise<void> {
  const webhook = await resolveInboundWebhook(organizationId);
  if (!webhook) throw new Error("Nenhum webhook configurado");
  await postToWebhook(webhook, { event: "test", occurredAt: new Date().toISOString() });
}

const globalForEvents = globalThis as unknown as {
  __voceroN8nInFlight?: Set<string>;
  __voceroN8nTimer?: NodeJS.Timeout;
};

function inFlight(): Set<string> {
  if (!globalForEvents.__voceroN8nInFlight) globalForEvents.__voceroN8nInFlight = new Set();
  return globalForEvents.__voceroN8nInFlight;
}

async function deliver(eventId: string): Promise<void> {
  if (inFlight().has(eventId)) return;
  inFlight().add(eventId);
  const db = getDb();
  try {
    const rows = await db
      .select({
        event: schema.n8nInboundEvent,
        message: schema.message,
        conversation: schema.conversation,
        contact: schema.contact,
        media: schema.messageMedia,
      })
      .from(schema.n8nInboundEvent)
      .innerJoin(schema.message, eq(schema.message.id, schema.n8nInboundEvent.messageId))
      .innerJoin(schema.conversation, eq(schema.conversation.id, schema.message.conversationId))
      .innerJoin(schema.contact, eq(schema.contact.id, schema.conversation.contactId))
      .leftJoin(schema.messageMedia, eq(schema.messageMedia.messageId, schema.message.id))
      .where(eq(schema.n8nInboundEvent.id, eventId))
      .limit(1);
    const row = rows[0];
    if (!row) return;

    try {
      const webhook = await resolveInboundWebhook(row.event.organizationId);
      if (!webhook) throw new Error("Webhook do n8n não configurado");
      await postToWebhook(
        webhook,
        buildInboundPayload({
          baseUrl: getEnv().APP_BASE_URL,
          message: row.message,
          conversation: row.conversation,
          contact: row.contact,
          media: row.media,
        })
      );
      await db.delete(schema.n8nInboundEvent).where(eq(schema.n8nInboundEvent.id, eventId));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const attempts = row.event.attempts + 1;
      await db
        .update(schema.n8nInboundEvent)
        .set({ attempts, lastError: error.slice(0, 500), lastAttemptAt: new Date() })
        .where(eq(schema.n8nInboundEvent.id, eventId));
      console.warn(`[n8n] evento ${eventId} não entregue (tentativa ${attempts}): ${error}`);
    }
  } finally {
    inFlight().delete(eventId);
  }
}

/** Enfileira e já tenta entregar, sem segurar a ingestão. */
export async function queueInboundEvent(organizationId: string, messageId: string): Promise<void> {
  const id = newId("n8nInboundEvent");
  const inserted = await getDb()
    .insert(schema.n8nInboundEvent)
    .values({ id, organizationId, messageId })
    .onConflictDoNothing({ target: [schema.n8nInboundEvent.messageId] })
    .returning({ id: schema.n8nInboundEvent.id });
  if (inserted.length === 0) return;
  void deliver(id).catch((err) => console.error(`[n8n] falha ao entregar o evento ${id}:`, err));
}

export async function runInboundDeliveryCycle(now: Date = new Date()): Promise<void> {
  const t = schema.n8nInboundEvent;
  const rows = await getDb()
    .select({ id: t.id, attempts: t.attempts, lastAttemptAt: t.lastAttemptAt })
    .from(t)
    .where(lt(t.attempts, RETRY_DELAYS_MS.length))
    .orderBy(asc(t.createdAt))
    .limit(CYCLE_BATCH * 4);
  const due = rows.filter((r) => isDeliveryDue(r.attempts, r.lastAttemptAt, now)).slice(0, CYCLE_BATCH);
  await Promise.all(
    due.map((r) =>
      deliver(r.id).catch((err) => console.error(`[n8n] falha ao entregar o evento ${r.id}:`, err))
    )
  );
}

export function startInboundDeliveryScheduler(): void {
  if (globalForEvents.__voceroN8nTimer) return;
  globalForEvents.__voceroN8nTimer = setInterval(() => {
    void runInboundDeliveryCycle().catch((err) => console.error("[n8n] ciclo falhou:", err));
  }, CYCLE_INTERVAL_MS);
}

/** Pendências da organização, para a tela de configuração. */
export async function getInboundQueueStats(
  organizationId: string
): Promise<{ pending: number; failed: number; lastError: string | null }> {
  const t = schema.n8nInboundEvent;
  const rows = await getDb()
    .select({ attempts: t.attempts, lastError: t.lastError })
    .from(t)
    .where(scoped(t.organizationId, organizationId))
    .orderBy(asc(t.createdAt))
    .limit(1000);
  const failed = rows.filter((r) => r.attempts >= RETRY_DELAYS_MS.length);
  return {
    pending: rows.length - failed.length,
    failed: failed.length,
    lastError: rows.findLast((r) => r.lastError)?.lastError ?? null,
  };
}
