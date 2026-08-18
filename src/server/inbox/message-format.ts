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
    error: m.error,
    aiGenerated: m.aiGenerated,
    replyToMessageId: m.replyToMessageId,
    senderName: senderName ?? null,
    createdAt: (m.waTimestamp ?? m.createdAt).toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    // Só texto de saída pelo canal não oficial, dentro da janela de 15min
    // do WhatsApp — mesma regra de `editMessage` em edit-message.ts. Client
    // não reimplementa a regra: só usa esta flag pra decidir se mostra o
    // botão "Editar" (o servidor sempre reforça a checagem de novo).
    // Prefixo literal (não importa `rawBaileysId` de baileys/inbound.ts pra
    // não criar ciclo ingest→message-format→inbound→ingest) — precisa
    // continuar igual ao de `baileysMessageId()` em baileys/inbound.ts.
    editable:
      m.direction === "out" &&
      m.type === "text" &&
      Boolean(m.waMessageId?.startsWith("unof:baileys:")) &&
      Date.now() - (m.waTimestamp ?? m.createdAt).getTime() < 15 * 60 * 1000,
  };
}
