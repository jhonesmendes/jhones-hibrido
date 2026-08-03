import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { publish } from "@/server/events/bus";
import { sendPushToOrganization } from "@/server/push/send";
import { getCredentialsByPhoneNumberId } from "@/server/whatsapp/credentials";
import { downloadMetaMedia, getMetaMediaMeta } from "@/lib/meta/client";
import type { WebhookMedia, WebhookValue } from "@/server/inbox/webhook";
import { applyStatusUpdate } from "@/server/inbox/status";
import { onLeadActivity } from "@/server/inbox/lead-activity";
import { maybeRunAgentTurn } from "@/server/ai/trigger";
import { onInboundMedia } from "@/server/pipeline/followup-document";

/** Marca `message.mediaUrl` quando os bytes vivem em `message_media`
 * (canal não oficial, autohospedado) em vez de uma URL externa buscável
 * (canal oficial, CDN da Meta). */
export const LOCAL_MEDIA_MARKER = "local";

/** Tipos de conteúdo suportados; o resto é ignorado sem erro. */
const SUPPORTED_TYPES = new Set([
  "text",
  "image",
  "audio",
  "video",
  "document",
  "sticker",
  "location",
  "contacts",
]);

export async function getOrCreateContact(
  organizationId: string,
  phone: string,
  name?: string | null,
  kind: "individual" | "group" = "individual"
) {
  const db = getDb();
  const inserted = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId,
      phone,
      kind,
      name: name?.trim() || phone,
    })
    .onConflictDoNothing({
      target: [schema.contact.organizationId, schema.contact.phone],
    })
    .returning();
  if (inserted[0]) return { contact: inserted[0], isNew: true };

  const rows = await db
    .select()
    .from(schema.contact)
    .where(
      and(
        eq(schema.contact.organizationId, organizationId),
        eq(schema.contact.phone, phone)
      )
    )
    .limit(1);
  const existing = rows[0];
  if (!existing) throw new Error("contato não encontrado após upsert");

  // Reativar se estava arquivado (o nome editado pelo operador é respeitado).
  if (existing.archivedAt) {
    await db
      .update(schema.contact)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(schema.contact.id, existing.id));
    existing.archivedAt = null;
  }
  return { contact: existing, isNew: false };
}

export async function getOrCreateConversation(
  organizationId: string,
  contactId: string,
  /** Departamento de quem iniciou manualmente (v0.1); só se aplica à
   * criação — conversas já existentes mantêm o departamento atual. */
  departmentId?: string | null
) {
  const db = getDb();
  const inserted = await db
    .insert(schema.conversation)
    .values({ id: newId("conversation"), organizationId, contactId, departmentId })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];

  const rows = await db
    .select()
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.contactId, contactId),
        eq(schema.conversation.isTest, false)
      )
    )
    .limit(1);
  const existing = rows[0];
  if (!existing) throw new Error("conversa não encontrada após upsert");
  return existing;
}

/**
 * Processa o `value` de uma mudança `messages` do webhook: mensagens
 * recebidas (idempotentes por wa_message_id) e atualizações de status.
 */
export async function processMessagesValue(value: WebhookValue): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) return;

  const credentials = await getCredentialsByPhoneNumberId(phoneNumberId);
  if (!credentials) {
    // Caso típico: webhook/override configurado ANTES de salvar a conexão
    // no wizard — o evento chega mas não há organização para rotear.
    console.warn(
      `[webhook] evento para phone_number_id desconhecido (${phoneNumberId}): ` +
        "salve a conexão em Configurações → WhatsApp para receber mensagens"
    );
    return;
  }

  const organizationId = credentials.organizationId;

  for (const status of value.statuses ?? []) {
    await applyStatusUpdate(organizationId, status);
  }

  for (const msg of value.messages ?? []) {
    if (!SUPPORTED_TYPES.has(msg.type)) continue; // reações, etc.: ignorar
    const profileName = value.contacts?.find(
      (c) => c.wa_id === msg.from
    )?.profile?.name;

    const mediaField: WebhookMedia | undefined =
      msg.image ?? msg.document ?? msg.audio ?? msg.video ?? msg.sticker;
    const media = mediaField
      ? await downloadOfficialMedia(mediaField, credentials.token)
      : null;

    await ingestInboundMessage({
      organizationId,
      metaCredentialId: credentials.id,
      from: msg.from,
      profileName: profileName ?? null,
      waMessageId: msg.id,
      type: msg.type,
      text: msg.text?.body ?? mediaField?.caption ?? null,
      timestamp: msg.timestamp,
      media,
    });
  }
}

/**
 * Baixa mídia do canal oficial (2 passos do Graph API: metadados → bytes) e
 * guarda localmente — igual ao WhatsApp Web, nunca depende de uma URL da
 * Meta ainda viva no momento em que o agente/usuário abre a conversa (essas
 * URLs expiram em minutos). Uma falha aqui não derruba a ingestão da
 * mensagem: ela entra sem mídia anexada, em vez de travar o webhook.
 */
async function downloadOfficialMedia(
  field: WebhookMedia,
  token: string
): Promise<{ mimeType: string; dataBase64: string; filename: string | null } | null> {
  try {
    const meta = await getMetaMediaMeta(field.id, token);
    const buffer = await downloadMetaMedia(meta.url, token);
    return {
      mimeType: field.mime_type ?? meta.mimeType,
      dataBase64: buffer.toString("base64"),
      filename: field.filename ?? null,
    };
  } catch (err) {
    console.error("[webhook] falha ao baixar mídia oficial:", err);
    return null;
  }
}

export async function ingestInboundMessage(input: {
  organizationId: string;
  from: string;
  profileName: string | null;
  waMessageId: string;
  type: string;
  text: string | null;
  timestamp: string;
  /** Canal de origem; sticky na conversa. Padrão: official. */
  channel?: "official" | "unofficial";
  /** Número oficial específico que recebeu (v0.1, multi-número); sticky
   * igual a `channel`. Só se aplica ao canal oficial — Baileys não passa. */
  metaCredentialId?: string | null;
  /** Canal não oficial específico que recebeu (v0.1, multi-sessão Baileys);
   * sticky igual a `channel`. Só se aplica ao canal não oficial. */
  unofficialChannelId?: string | null;
  /**
   * true = eco de uma mensagem enviada pelo próprio número (típico de
   * gateways não oficiais: inclui o que foi enviado a partir do telefone).
   * É registrado como saída, sem unread nem turno do agente.
   */
  fromMe?: boolean;
  /** URL da mídia no gateway (servida ao navegador via /api/media/[id]). */
  mediaUrl?: string | null;
  /** Bytes de mídia já baixados (sem URL de terceiro persistente). */
  media?: { mimeType: string; dataBase64: string; filename?: string | null } | null;
  /** Grupo do canal não oficial (a Cloud API oficial não suporta grupos). */
  contactKind?: "individual" | "group";
}): Promise<void> {
  const db = getDb();
  const { organizationId } = input;
  const channel = input.channel ?? "official";
  const fromMe = input.fromMe ?? false;

  const { contact } = await getOrCreateContact(
    organizationId,
    input.from,
    input.profileName,
    input.contactKind ?? "individual"
  );
  const conversation = await getOrCreateConversation(
    organizationId,
    contact.id
  );

  const waTimestamp = toDate(input.timestamp);

  // Idempotência dura: mesmo wa_message_id → sem efeitos adicionais.
  // Cobre também o eco do gateway para envios feitos a partir do CRM.
  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId,
      conversationId: conversation.id,
      waMessageId: input.waMessageId,
      direction: fromMe ? "out" : "in",
      type: input.type,
      text: input.text,
      mediaUrl: input.mediaUrl ?? (input.media ? LOCAL_MEDIA_MARKER : null),
      status: fromMe ? "sent" : "delivered",
      waTimestamp,
    })
    .onConflictDoNothing({ target: [schema.message.waMessageId] })
    .returning();
  const message = inserted[0];
  if (!message) return; // duplicado

  if (input.media) {
    await db
      .insert(schema.messageMedia)
      .values({
        id: newId("messageMedia"),
        organizationId,
        messageId: message.id,
        mimeType: input.media.mimeType,
        dataBase64: input.media.dataBase64,
        filename: input.media.filename ?? null,
        sizeBytes: Math.ceil((input.media.dataBase64.length * 3) / 4),
      })
      .onConflictDoNothing({ target: [schema.messageMedia.messageId] });
  }

  await db
    .update(schema.conversation)
    .set(
      fromMe
        ? { lastMessageAt: waTimestamp, updatedAt: new Date() }
        : {
            lastInboundAt: waTimestamp,
            lastMessageAt: waTimestamp,
            unreadCount: sql`${schema.conversation.unreadCount} + 1`,
            channel, // sticky: responder pelo canal por onde o cliente escreveu
            ...(input.metaCredentialId !== undefined
              ? { metaCredentialId: input.metaCredentialId }
              : {}),
            ...(input.unofficialChannelId !== undefined
              ? { unofficialChannelId: input.unofficialChannelId }
              : {}),
            updatedAt: new Date(),
          }
    )
    .where(eq(schema.conversation.id, conversation.id));

  // Grupo não é lead nem alvo de follow-up de pipeline (Foco Vertical): o
  // pipeline é sobre converter conversas individuais, não threads coletivas.
  if (contact.kind !== "group") {
    await onLeadActivity(organizationId, contact.id, waTimestamp);
    if (!fromMe && MEDIA_TYPES.has(input.type)) {
      await onInboundMedia(organizationId, contact.id);
    }
  }

  publish(organizationId, {
    type: "message.new",
    data: {
      conversationId: conversation.id,
      message: serializeMessage(
        message,
        input.media
          ? {
              filename: input.media.filename ?? null,
              sizeBytes: Math.ceil((input.media.dataBase64.length * 3) / 4),
              mimeType: input.media.mimeType,
            }
          : null
      ),
    },
  });
  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conversation.id } },
  });

  if (!fromMe) {
    sendPushToOrganization(organizationId, {
      title: contact.name || input.from,
      body: input.text?.trim() || MEDIA_PUSH_LABELS[input.type] || "Nova mensagem",
      icon: `/api/contacts/${contact.id}/avatar`,
      url: `/inbox?contact=${contact.id}`,
      conversationId: conversation.id,
    }).catch((err) => console.error("[push] falha ao notificar organização:", err));

    // O agente de IA responde conversas individuais, não grupos: uma
    // resposta automática numa thread coletiva sem pedido é intrusiva e
    // foge do escopo do produto (converter conversas, não moderar grupos).
    if (contact.kind !== "group") await maybeRunAgentTurn(conversation.id);
  }
}

function toDate(timestamp: string): Date {
  const n = Number(timestamp);
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000);
  return new Date();
}

const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "sticker"]);

const MEDIA_PUSH_LABELS: Record<string, string> = {
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
  sticker: "Figurinha",
  location: "Localização",
  contacts: "Contato compartilhado",
};

/**
 * true se a mídia desta mensagem pode ser servida pelo proxy /api/media/[id]
 * — canal oficial: `mediaUrl` é a URL real do CDN da Meta. Canal não
 * oficial: `mediaUrl` é o marcador `LOCAL_MEDIA_MARKER`, e os bytes de
 * verdade estão em `message_media`.
 */
function hasServableMedia(m: typeof schema.message.$inferSelect): boolean {
  return MEDIA_TYPES.has(m.type) && Boolean(m.mediaUrl);
}

export function serializeMessage(
  m: typeof schema.message.$inferSelect,
  media?: { filename: string | null; sizeBytes: number | null; mimeType: string | null } | null
) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    direction: m.direction,
    type: m.type,
    text: m.text,
    // Sempre a rota do proxy: a URL real do gateway nunca vai ao navegador.
    mediaUrl: hasServableMedia(m) ? `/api/media/${m.id}` : null,
    filename: media?.filename ?? null,
    sizeBytes: media?.sizeBytes ?? null,
    mimeType: media?.mimeType ?? null,
    status: m.status,
    aiGenerated: m.aiGenerated,
    createdAt: (m.waTimestamp ?? m.createdAt).toISOString(),
  };
}
