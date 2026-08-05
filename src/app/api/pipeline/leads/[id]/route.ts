import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  ForbiddenError,
  requirePermission,
  resolvePermissions,
} from "@/lib/auth/require-permission";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { publish } from "@/server/events/bus";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  stageId: z.string().min(1),
  position: z.number().int().min(0),
});

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  await requirePermission(session, "pipeline:move");
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const stage = await db
    .select({ id: schema.pipelineStage.id })
    .from(schema.pipelineStage)
    .where(
      scoped(
        schema.pipelineStage.organizationId,
        session.organizationId,
        eq(schema.pipelineStage.id, body.data.stageId)
      )
    )
    .limit(1);
  if (!stage[0]) return apiError(422, "invalid_stage", "Etapa inexistente");

  // Mesma regra de visibilidade do board (GET /api/pipeline/board): sem
  // "Ver todas as conversas", só pode mover um lead cujo contato tenha ao
  // menos uma conversa atribuída a este membro — senão o board não mostra
  // o card, mas a API ainda aceitava mover pelo ID direto.
  const effective = await resolvePermissions(session.memberId, session.role);
  if (!effective.has("conversations:view_all")) {
    const leadRows = await db
      .select({ contactId: schema.lead.contactId })
      .from(schema.lead)
      .where(scoped(schema.lead.organizationId, session.organizationId, eq(schema.lead.id, id)))
      .limit(1);
    const contactId = leadRows[0]?.contactId;
    if (!contactId) return apiError(404, "not_found", "Lead não encontrado");

    const ownedConversation = await db
      .select({ id: schema.conversation.id })
      .from(schema.conversation)
      .where(
        and(
          eq(schema.conversation.organizationId, session.organizationId),
          eq(schema.conversation.contactId, contactId),
          eq(schema.conversation.isTest, false),
          eq(schema.conversation.assignedTo, session.memberId)
        )
      )
      .limit(1);
    if (!ownedConversation[0]) {
      throw new ForbiddenError("Lead não atribuído a você");
    }
  }

  const updated = await db
    .update(schema.lead)
    .set({
      stageId: body.data.stageId,
      position: body.data.position,
      updatedAt: new Date(),
    })
    .where(
      scoped(
        schema.lead.organizationId,
        session.organizationId,
        eq(schema.lead.id, id)
      )
    )
    .returning();
  if (!updated[0]) return apiError(404, "not_found", "Lead não encontrado");

  // Notifica a caixa de entrada para que a etapa seja refletida em tempo real
  // (painel de detalhes e indicador de etapa da lista) sem recarregar — o
  // contato pode ter mais de uma conversa (uma por canal), então avisa
  // todas, não só a primeira.
  const convRows = await db
    .select({ id: schema.conversation.id })
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, session.organizationId),
        eq(schema.conversation.contactId, updated[0].contactId),
        eq(schema.conversation.isTest, false)
      )
    );
  for (const conv of convRows) {
    publish(session.organizationId, {
      type: "conversation.updated",
      data: { conversation: { id: conv.id } },
    });
  }

  return Response.json({ lead: updated[0] });
});
