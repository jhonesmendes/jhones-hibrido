import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { publish } from "@/server/events/bus";
import { getCredentialsByPhoneNumberId } from "@/server/whatsapp/credentials";
import type { WebhookValue } from "@/server/inbox/webhook";
import { applyStatusUpdate } from "@/server/inbox/status";
import { onLeadActivity } from "@/server/inbox/lead-activity";
import { maybeRunAgentTurn } from "@/server/ai/trigger";
import { onInboundMedia } from "@/server/pipeline/followup-document";

/** Marca `message.mediaUrl` cuando los bytes viven en `message_media`
 * (canal no oficial, autohospedado) en vez de una URL externa fetchable
 * (canal oficial, CDN de Meta). */
export const LOCAL_MEDIA_MARKER = "local";

/** Tipos de contenido soportados; el resto se ignora sin error. */
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
  name?: string | null
) {
  const db = getDb();
  const inserted = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId,
      phone,
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
  if (!existing) throw new Error("contacto no encontrado tras upsert");

  // Reactivar si estaba archivado (el nombre editado por el operador se respeta).
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
  contactId: string
) {
  const db = getDb();
  const inserted = await db
    .insert(schema.conversation)
    .values({ id: newId("conversation"), organizationId, contactId })
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
  if (!existing) throw new Error("conversación no encontrada tras upsert");
  return existing;
}

/**
 * Procesa el `value` de un cambio `messages` del webhook: mensajes entrantes
 * (idempotentes por wa_message_id) y actualizaciones de estado.
 */
export async function processMessagesValue(value: WebhookValue): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) return;

  const credentials = await getCredentialsByPhoneNumberId(phoneNumberId);
  if (!credentials) {
    // Caso típico: webhook/override configurado ANTES de guardar la conexión
    // en el wizard — el evento llega pero no hay a qué organización enrutarlo.
    console.warn(
      `[webhook] evento para phone_number_id desconocido (${phoneNumberId}): ` +
        "guarda la conexión en Configuración → WhatsApp para recibir mensajes"
    );
    return;
  }

  const organizationId = credentials.organizationId;

  for (const status of value.statuses ?? []) {
    await applyStatusUpdate(organizationId, status);
  }

  for (const msg of value.messages ?? []) {
    if (!SUPPORTED_TYPES.has(msg.type)) continue; // reacciones, etc.: ignorar
    const profileName = value.contacts?.find(
      (c) => c.wa_id === msg.from
    )?.profile?.name;
    await ingestInboundMessage({
      organizationId,
      from: msg.from,
      profileName: profileName ?? null,
      waMessageId: msg.id,
      type: msg.type,
      text: msg.text?.body ?? null,
      timestamp: msg.timestamp,
    });
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
  /** Canal de origen; sticky en la conversación. Default: official. */
  channel?: "official" | "unofficial";
  /**
   * true = eco de un mensaje enviado por el propio número (típico de
   * gateways no oficiales: incluye lo enviado desde el teléfono). Se
   * registra como saliente, sin unread ni turno del agente.
   */
  fromMe?: boolean;
  /** URL da mídia no gateway (servida ao navegador via /api/media/[id]). */
  mediaUrl?: string | null;
  /** Bytes de mídia já baixados (canal não oficial: sem URL de terceiro). */
  media?: { mimeType: string; dataBase64: string } | null;
}): Promise<void> {
  const db = getDb();
  const { organizationId } = input;
  const channel = input.channel ?? "official";
  const fromMe = input.fromMe ?? false;

  const { contact } = await getOrCreateContact(
    organizationId,
    input.from,
    input.profileName
  );
  const conversation = await getOrCreateConversation(
    organizationId,
    contact.id
  );

  const waTimestamp = toDate(input.timestamp);

  // Idempotencia dura: mismo wa_message_id → sin efectos adicionales.
  // Cubre también el eco del gateway para envíos hechos desde el CRM.
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
            channel, // sticky: responder por donde escribió el cliente
            updatedAt: new Date(),
          }
    )
    .where(eq(schema.conversation.id, conversation.id));

  await onLeadActivity(organizationId, contact.id, waTimestamp);
  if (!fromMe && MEDIA_TYPES.has(input.type)) {
    await onInboundMedia(organizationId, contact.id);
  }

  publish(organizationId, {
    type: "message.new",
    data: { conversationId: conversation.id, message: serializeMessage(message) },
  });
  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conversation.id } },
  });

  if (!fromMe) await maybeRunAgentTurn(conversation.id);
}

function toDate(timestamp: string): Date {
  const n = Number(timestamp);
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000);
  return new Date();
}

const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "sticker"]);

/**
 * true se a mídia desta mensagem pode ser servida pelo proxy /api/media/[id]
 * — canal oficial: `mediaUrl` é a URL real do CDN da Meta. Canal não
 * oficial: `mediaUrl` é o marcador `LOCAL_MEDIA_MARKER`, e os bytes de
 * verdade estão em `message_media`.
 */
function hasServableMedia(m: typeof schema.message.$inferSelect): boolean {
  return MEDIA_TYPES.has(m.type) && Boolean(m.mediaUrl);
}

export function serializeMessage(m: typeof schema.message.$inferSelect) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    direction: m.direction,
    type: m.type,
    text: m.text,
    // Sempre a rota do proxy: a URL real do gateway nunca vai ao navegador.
    mediaUrl: hasServableMedia(m) ? `/api/media/${m.id}` : null,
    status: m.status,
    aiGenerated: m.aiGenerated,
    createdAt: (m.waTimestamp ?? m.createdAt).toISOString(),
  };
}
