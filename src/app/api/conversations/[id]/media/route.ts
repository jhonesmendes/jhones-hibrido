import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  requireChannelAccess,
  requireConversationAccess,
  requirePermission,
} from "@/lib/auth/require-permission";
import { getConversation } from "@/server/inbox/queries";
import { SendError, sendMedia } from "@/server/inbox/send";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** ~16MB de bytes crus (limite generoso de mídia do WhatsApp) — base64 infla
 * ~4/3, então o teto da string é maior. */
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil((MAX_MEDIA_BYTES * 4) / 3) + 1024;

const sendMediaSchema = z.object({
  dataBase64: z.string().min(1).max(MAX_BASE64_LENGTH),
  mimeType: z.string().trim().min(1).max(255),
  filename: z.string().trim().max(255).optional(),
  caption: z.string().trim().max(1024).optional(),
  channel: z.enum(["official", "unofficial"]).optional(),
});

const SEND_ERROR_STATUS: Record<SendError["code"], number> = {
  sandbox_violation: 403,
  not_connected: 409,
  recipient_not_found: 422,
  reconnect_required: 409,
  window_closed: 409,
  meta_error: 422,
  meta_unavailable: 503,
};

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, sendMediaSchema);
  if (!body.ok) return body.response;

  const row = await getConversation(session.organizationId, id);
  if (!row) return apiError(404, "not_found", "Conversa não encontrada");
  await requireConversationAccess(session, row.conversation);
  await requirePermission(session, "conversations:reply");
  const effectiveChannel = body.data.channel ?? row.conversation.channel;
  await requireChannelAccess(session, effectiveChannel, "send");

  let buffer: Buffer;
  try {
    buffer = Buffer.from(body.data.dataBase64, "base64");
  } catch {
    return apiError(422, "invalid", "Arquivo inválido");
  }
  if (buffer.length === 0 || buffer.length > MAX_MEDIA_BYTES) {
    return apiError(422, "invalid", "Arquivo vazio ou maior que o permitido (16MB)");
  }

  try {
    const result = await sendMedia({
      conversationId: id,
      organizationId: session.organizationId,
      buffer,
      mimeType: body.data.mimeType,
      filename: body.data.filename ?? null,
      caption: body.data.caption,
      channelOverride: body.data.channel,
    });
    return Response.json({ messageId: result.messageId });
  } catch (err) {
    if (err instanceof SendError) {
      return apiError(SEND_ERROR_STATUS[err.code], err.code, err.message);
    }
    throw err;
  }
});
