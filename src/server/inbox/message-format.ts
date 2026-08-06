import type { schema } from "@/lib/db";

/** Marca `message.mediaUrl` quando os bytes vivem em `message_media`
 * (canal não oficial, autohospedado) em vez de uma URL externa buscável
 * (canal oficial, CDN da Meta).
 *
 * Extraído de ingest.ts pra `send.ts` (e agora `queue/selection.ts`, via
 * `sendText`) não precisar importar ingest.ts de volta — evita ciclo. */
export const LOCAL_MEDIA_MARKER = "local";

export const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "sticker"]);

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
  media?: { filename: string | null; sizeBytes: number | null; mimeType: string | null } | null,
  /** Assinatura no painel interno (quem mandou) — nunca vai pro WhatsApp. */
  senderName?: string | null
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
    replyToMessageId: m.replyToMessageId,
    senderName: senderName ?? null,
    createdAt: (m.waTimestamp ?? m.createdAt).toISOString(),
  };
}
