import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  requireConversationAccess,
  requirePermission,
} from "@/lib/auth/require-permission";
import { editMessage, EditMessageError } from "@/server/inbox/edit-message";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  text: z.string().trim().min(1).max(4096),
});

const EDIT_ERROR_STATUS: Record<EditMessageError["code"], number> = {
  not_found: 404,
  not_editable: 422,
  expired: 409,
  not_connected: 409,
  failed: 502,
};

/** Edita o texto de uma mensagem já enviada — só canal não oficial, só
 * dentro da janela de 15min do WhatsApp (ver `src/server/inbox/edit-message.ts`). */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const rows = await getDb()
    .select({
      assignedTo: schema.conversation.assignedTo,
      departmentId: schema.conversation.departmentId,
      contactKind: schema.contact.kind,
    })
    .from(schema.message)
    .innerJoin(
      schema.conversation,
      eq(schema.conversation.id, schema.message.conversationId)
    )
    .innerJoin(schema.contact, eq(schema.contact.id, schema.conversation.contactId))
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

  try {
    const message = await editMessage({
      organizationId: session.organizationId,
      messageId: id,
      newText: body.data.text,
    });
    return Response.json({ message });
  } catch (err) {
    if (err instanceof EditMessageError) {
      return apiError(EDIT_ERROR_STATUS[err.code], err.code, err.message);
    }
    throw err;
  }
});
