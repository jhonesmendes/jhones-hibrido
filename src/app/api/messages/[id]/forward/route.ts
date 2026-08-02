import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  requireConversationAccess,
  requirePermission,
} from "@/lib/auth/require-permission";
import { forwardMessage } from "@/server/inbox/forward";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  targetContactIds: z.array(z.string().min(1)).min(1).max(20),
  caption: z.string().trim().max(1000).optional(),
});

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const rows = await getDb()
    .select({
      assignedTo: schema.conversation.assignedTo,
      departmentId: schema.conversation.departmentId,
    })
    .from(schema.message)
    .innerJoin(
      schema.conversation,
      eq(schema.conversation.id, schema.message.conversationId)
    )
    .where(
      scoped(
        schema.message.organizationId,
        session.organizationId,
        eq(schema.message.id, id)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return apiError(404, "not_found", "Mensagem não encontrada");
  await requireConversationAccess(session, row);
  await requirePermission(session, "conversations:reply");

  const results = await forwardMessage(session, {
    messageId: id,
    targetContactIds: body.data.targetContactIds,
    caption: body.data.caption,
  });

  return Response.json({ results });
});
