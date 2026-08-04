import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  requireChannelAccess,
  requireConversationAccess,
  requirePermission,
} from "@/lib/auth/require-permission";
import { getConversation, listMessages } from "@/server/inbox/queries";
import { serializeMessage } from "@/server/inbox/ingest";
import { SendError, sendText } from "@/server/inbox/send";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const row = await getConversation(session.organizationId, id);
  if (!row) return apiError(404, "not_found", "Conversa não encontrada");
  await requireConversationAccess(session, row.conversation);
  await requireChannelAccess(session, row.conversation.channel, "view");

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  const messages = await listMessages(
    session.organizationId,
    id,
    since && !Number.isNaN(since.getTime()) ? since : undefined
  );
  return Response.json({
    messages: messages.map((row) =>
      serializeMessage(row.message, {
        filename: row.filename,
        sizeBytes: row.sizeBytes,
        mimeType: row.mimeType,
      })
    ),
  });
});

const sendSchema = z.object({
  text: z.string().trim().min(1).max(4096),
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
  const body = await parseBody(req, sendSchema);
  if (!body.ok) return body.response;

  const row = await getConversation(session.organizationId, id);
  if (!row) return apiError(404, "not_found", "Conversa não encontrada");
  await requireConversationAccess(session, row.conversation);
  await requirePermission(session, "conversations:reply");
  const effectiveChannel = body.data.channel ?? row.conversation.channel;
  await requireChannelAccess(session, effectiveChannel, "send");

  try {
    const result = await sendText({
      conversationId: id,
      organizationId: session.organizationId,
      text: body.data.text,
      channelOverride: body.data.channel,
      actorMemberId: session.memberId,
    });
    return Response.json({ messageId: result.messageId });
  } catch (err) {
    if (err instanceof SendError) {
      return apiError(SEND_ERROR_STATUS[err.code], err.code, err.message);
    }
    throw err;
  }
});
