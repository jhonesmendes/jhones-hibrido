import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  requireChannelAccess,
  requireConversationAccess,
  requirePermission,
} from "@/lib/auth/require-permission";
import { SendError } from "@/server/inbox/send";
import { getConversation } from "@/server/inbox/queries";
import {
  sendTemplate,
  TemplateError,
  templateErrorStatus,
} from "@/server/whatsapp/templates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  templateId: z.string().min(1),
  variables: z.array(z.string().trim().max(500)).max(10).optional(),
});

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const row = await getConversation(session.organizationId, id);
  if (!row) return apiError(404, "not_found", "Conversa não encontrada");
  await requireConversationAccess(session, {
    ...row.conversation,
    contactKind: row.contact.kind,
  });
  await requirePermission(session, "conversations:reply");
  await requireChannelAccess(session, "official", "send");

  try {
    const result = await sendTemplate({
      organizationId: session.organizationId,
      conversationId: id,
      templateId: body.data.templateId,
      variables: body.data.variables,
    });
    return Response.json({ messageId: result.messageId });
  } catch (err) {
    if (err instanceof TemplateError) {
      return apiError(templateErrorStatus(err), err.code, err.message);
    }
    if (err instanceof SendError) {
      return apiError(403, err.code, err.message);
    }
    throw err;
  }
});
