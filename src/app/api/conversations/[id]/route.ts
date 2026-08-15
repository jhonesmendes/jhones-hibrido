import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { requireConversationAccess, requirePermission } from "@/lib/auth/require-permission";
import { publish } from "@/server/events/bus";
import {
  deleteConversation,
  serializeConversation,
  getConversation,
  updateConversation,
} from "@/server/inbox/queries";
import { logAudit } from "@/server/auth/audit";

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

/** Exclui a conversa de vez — owner sempre pode; admin/agente só com a
 * permissão `conversations:delete` explicitamente concedida (não é padrão
 * pra ninguém além do owner, ver DEFAULT_PERMISSIONS). */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;

  const existing = await getConversation(session.organizationId, id);
  if (!existing) return apiError(404, "not_found", "Conversa não encontrada");
  await requireConversationAccess(session, {
    ...existing.conversation,
    contactKind: existing.contact.kind,
  });
  await requirePermission(session, "conversations:delete");

  const deleted = await deleteConversation(session.organizationId, id);
  if (!deleted) return apiError(404, "not_found", "Conversa não encontrada");

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "conversation.deleted",
    resource: "conversation",
    resourceId: id,
  });

  publish(session.organizationId, {
    type: "conversation.deleted",
    data: { conversationId: id },
  });

  return Response.json({ ok: true });
});
