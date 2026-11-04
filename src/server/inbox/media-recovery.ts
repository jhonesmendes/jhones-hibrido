import { eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { downloadMetaMedia, getMetaMediaMeta } from "@/lib/meta/client";
import { publish } from "@/server/events/bus";
import { serializeMessage } from "@/server/inbox/message-format";
import { getCredentialsById } from "@/server/whatsapp/credentials";
import { saveMessageMedia } from "@/server/media/store";
import { deserializeMediaSource, downloadBaileysMedia } from "@/server/baileys/media";

/**
 * Recuperação de mídia recebida cujo download falhou na ingestão — a
 * mensagem entra na hora (nunca fica refém da mídia) e a ORIGEM da mídia
 * fica em `message_media_pending` até dar certo. Três gatilhos:
 * 1. logo após a ingestão (com reupload pelo celular, no não oficial);
 * 2. ciclo periódico com backoff (`startMediaRecoveryScheduler`), que
 *    sobrevive a reinício do container;
 * 3. sob demanda, quando alguém abre a mídia (`/api/media/[id]`).
 * Ao recuperar, publica `message.updated` — a mídia aparece sozinha na tela.
 */

export type PendingMediaSource =
  | { kind: "baileys"; channelId: string; raw: string }
  | {
      kind: "official";
      metaCredentialId: string;
      mediaId: string;
      mimeType: string | null;
      filename: string | null;
    };

type RecoveredMedia = { mimeType: string; dataBase64: string; filename: string | null };

/** Espera ANTES da tentativa N+1 (índice = tentativas já feitas). Depois
 * da última, só a recuperação sob demanda tenta de novo. */
export const RETRY_DELAYS_MS = [
  0,
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  6 * 60 * 60_000,
  24 * 60 * 60_000,
];
const ON_DEMAND_MIN_INTERVAL_MS = 30_000;
const RECOVERY_TIMEOUT_MS = 60_000;
const CYCLE_INTERVAL_MS = 30_000;
const CYCLE_BATCH = 20;

const globalForRecovery = globalThis as unknown as {
  __voceroMediaRecoveryInFlight?: Map<string, Promise<boolean>>;
  __voceroMediaRecoveryTimer?: NodeJS.Timeout;
};

function inFlight(): Map<string, Promise<boolean>> {
  if (!globalForRecovery.__voceroMediaRecoveryInFlight) {
    globalForRecovery.__voceroMediaRecoveryInFlight = new Map();
  }
  return globalForRecovery.__voceroMediaRecoveryInFlight;
}

/** true se já passou o backoff desde a última tentativa. */
export function isRetryDue(attempts: number, lastAttemptAt: Date | null, now: Date): boolean {
  if (attempts >= RETRY_DELAYS_MS.length) return false;
  if (!lastAttemptAt) return true;
  return now.getTime() - lastAttemptAt.getTime() >= (RETRY_DELAYS_MS[attempts] ?? 0);
}

/** Registra a origem da mídia (cifrada) e já dispara a 1ª recuperação. */
export async function queueMediaRecovery(
  organizationId: string,
  messageId: string,
  source: PendingMediaSource
): Promise<void> {
  const enc = encryptSecret(JSON.stringify(source));
  await getDb()
    .insert(schema.messageMediaPending)
    .values({
      id: newId("messageMediaPending"),
      organizationId,
      messageId,
      sourceCipher: enc.cipher,
      sourceIv: enc.iv,
      sourceTag: enc.tag,
    })
    .onConflictDoNothing({ target: [schema.messageMediaPending.messageId] });

  void recoverPendingMedia(messageId, { force: true }).catch((err) =>
    console.error(`[media-recovery] falha ao recuperar mídia ${messageId}:`, err)
  );
}

/**
 * Tenta recuperar a mídia de uma mensagem. Deduplicado: chamadas
 * simultâneas (ciclo + navegador) compartilham a mesma tentativa. Sem
 * `force`, respeita um intervalo mínimo desde a última tentativa — abrir a
 * conversa várias vezes não martela o WhatsApp.
 */
export function recoverPendingMedia(
  messageId: string,
  opts: { force?: boolean } = {}
): Promise<boolean> {
  const running = inFlight().get(messageId);
  if (running) return running;
  const attempt = attemptRecovery(messageId, opts.force ?? false).finally(() =>
    inFlight().delete(messageId)
  );
  inFlight().set(messageId, attempt);
  return attempt;
}

async function downloadFromSource(
  organizationId: string,
  source: PendingMediaSource
): Promise<RecoveredMedia> {
  if (source.kind === "official") {
    const credentials = await getCredentialsById(source.metaCredentialId, organizationId);
    if (!credentials) throw new Error("número oficial não existe mais nesta organização");
    const meta = await getMetaMediaMeta(source.mediaId, credentials.token);
    const buffer = await downloadMetaMedia(meta.url, credentials.token);
    return {
      mimeType: source.mimeType ?? meta.mimeType,
      dataBase64: buffer.toString("base64"),
      filename: source.filename,
    };
  }

  // Import dinâmico: manager → inbound → ingest → este módulo (ciclo).
  const { getSocket } = await import("@/server/baileys/manager");
  const sock = getSocket(source.channelId);
  if (!sock) throw new Error("canal não oficial desconectado");
  return downloadBaileysMedia(sock, deserializeMediaSource(source.raw), {
    reupload: true,
    timeoutMs: RECOVERY_TIMEOUT_MS,
  });
}

async function attemptRecovery(messageId: string, force: boolean): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.messageMediaPending)
    .where(eq(schema.messageMediaPending.messageId, messageId))
    .limit(1);
  const pending = rows[0];
  if (!pending) return false;
  if (
    !force &&
    pending.lastAttemptAt &&
    Date.now() - pending.lastAttemptAt.getTime() < ON_DEMAND_MIN_INTERVAL_MS
  ) {
    return false;
  }

  let media: RecoveredMedia;
  try {
    const source = JSON.parse(
      decryptSecret({ cipher: pending.sourceCipher, iv: pending.sourceIv, tag: pending.sourceTag })
    ) as PendingMediaSource;
    media = await downloadFromSource(pending.organizationId, source);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.messageMediaPending)
      .set({ attempts: pending.attempts + 1, lastError: error.slice(0, 500), lastAttemptAt: new Date() })
      .where(eq(schema.messageMediaPending.id, pending.id));
    console.warn(
      `[media-recovery] mídia ${messageId} ainda indisponível (tentativa ${pending.attempts + 1}): ${error}`
    );
    return false;
  }

  const { sizeBytes } = await saveMessageMedia({
    organizationId: pending.organizationId,
    messageId,
    mimeType: media.mimeType,
    bytes: Buffer.from(media.dataBase64, "base64"),
    filename: media.filename,
  });
  await db.delete(schema.messageMediaPending).where(eq(schema.messageMediaPending.id, pending.id));

  const messageRows = await db
    .select()
    .from(schema.message)
    .where(eq(schema.message.id, messageId))
    .limit(1);
  const message = messageRows[0];
  if (message) {
    publish(pending.organizationId, {
      type: "message.updated",
      data: {
        conversationId: message.conversationId,
        message: serializeMessage(message, {
          filename: media.filename,
          sizeBytes,
          mimeType: media.mimeType,
        }),
      },
    });
  }
  console.info(`[media-recovery] mídia ${messageId} recuperada (${pending.attempts + 1}ª tentativa)`);
  return true;
}

export async function runMediaRecoveryCycle(now: Date = new Date()): Promise<void> {
  const rows = await getDb()
    .select({
      messageId: schema.messageMediaPending.messageId,
      attempts: schema.messageMediaPending.attempts,
      lastAttemptAt: schema.messageMediaPending.lastAttemptAt,
    })
    .from(schema.messageMediaPending)
    .where(lt(schema.messageMediaPending.attempts, RETRY_DELAYS_MS.length));

  const due = rows
    .filter((r) => isRetryDue(r.attempts, r.lastAttemptAt, now))
    .slice(0, CYCLE_BATCH);
  for (const row of due) {
    try {
      await recoverPendingMedia(row.messageId, { force: true });
    } catch (err) {
      console.error(`[media-recovery] falha ao recuperar mídia ${row.messageId}:`, err);
    }
  }
}

export function startMediaRecoveryScheduler(): void {
  if (globalForRecovery.__voceroMediaRecoveryTimer) return;
  globalForRecovery.__voceroMediaRecoveryTimer = setInterval(() => {
    void runMediaRecoveryCycle().catch((err) =>
      console.error("[media-recovery] ciclo falhou:", err)
    );
  }, CYCLE_INTERVAL_MS);
}
