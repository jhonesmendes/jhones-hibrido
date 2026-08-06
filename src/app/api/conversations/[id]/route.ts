import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { requireConversationAccess, requirePermission } from "@/lib/auth/require-permission";
import { publish } from "@/server/events/bus";
import { serializeConversation, getConversation, updateConversation } from "@/server/inbox/queries";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  aiEnabled: z.boolean().optional(),
  reactivate: z.boolean().optional(),
  markRead: z.boolean().optional(),
  channel: z.enum(["official", "unofficial"]).optional(),
  assignedTo: z.string().nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const existing = await getConversation(session.organizationId, id);
  if (!existing) return apiError(404, "not_found", "Conversa não encontrada");
  await requireConversationAccess(session, {
    ...existing.conversation,
    contactKind: existing.contact.kind,
  });
  if (body.data.assignedTo !== undefined) {
    await requirePermission(session, "conversations:assign");
  }

  const updated = await updateConversation(session.organizationId, id, body.data);
  if (!updated) return apiError(404, "not_found", "Conversa não encontrada");

  const row = await getConversation(session.organizationId, id);
  if (row) {
    const dto = serializeConversation(row.conversation, row.contact);
    publish(session.organizationId, {
      type: "conversation.updated",
      data: { conversation: dto },
    });
    return Response.json({ conversation: dto });
  }
  return Response.json({ conversation: null });
});
