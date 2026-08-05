import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { departmentRole, requireConversationAccess } from "@/lib/auth/require-permission";
import { getConversation, serializeConversation, updateConversation } from "@/server/inbox/queries";
import { listDepartmentAgents } from "@/server/queue/manager";
import { publish } from "@/server/events/bus";
import { logTrace } from "@/server/observability/trace";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Repasse de atendimento entre agentes do MESMO departamento — cenário que
 * não tinha um caminho fácil: agente 1 atendendo, precisa passar pro agente
 * 2 sem sair do painel da conversa. Deliberadamente mais permissivo que
 * `PATCH /conversations/[id]` (que exige `conversations:assign`, uma
 * permissão de org inteira): aqui basta pertencer ao departamento da
 * conversa — é um repasse entre colegas do mesmo time, não uma
 * reatribuição livre. Não cobre mudar de departamento (fora de escopo).
 */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const row = await getConversation(session.organizationId, id);
  if (!row) return apiError(404, "not_found", "Conversa não encontrada");
  await requireConversationAccess(session, row.conversation);

  const departmentId = row.conversation.departmentId;
  if (!departmentId) {
    return Response.json({ departmentId: null, members: [] });
  }

  const agents = await listDepartmentAgents(departmentId);
  return Response.json({
    departmentId,
    members: agents
      .filter((a) => a.memberId !== row.conversation.assignedTo)
      .map((a) => ({ memberId: a.memberId, name: a.name, online: a.status === "online" })),
  });
});

const transferSchema = z.object({ targetMemberId: z.string().min(1) });

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, transferSchema);
  if (!body.ok) return body.response;

  const row = await getConversation(session.organizationId, id);
  if (!row) return apiError(404, "not_found", "Conversa não encontrada");
  await requireConversationAccess(session, row.conversation);

  const departmentId = row.conversation.departmentId;
  if (!departmentId) {
    return apiError(422, "no_department", "Esta conversa não pertence a um departamento");
  }

  // Quem transfere precisa pertencer ao departamento (agente ou admin) —
  // owner sempre passa. Mesma regra pro alvo: só entre gente do mesmo time.
  if (session.role !== "owner") {
    const role = await departmentRole(session.memberId, departmentId);
    if (!role) return apiError(403, "forbidden", "Você não pertence a este departamento");
  }
  const targetRole = await departmentRole(body.data.targetMemberId, departmentId);
  if (!targetRole) {
    return apiError(422, "invalid_target", "O destino não pertence a este departamento");
  }

  const updated = await updateConversation(session.organizationId, id, {
    assignedTo: body.data.targetMemberId,
  });
  if (!updated) return apiError(404, "not_found", "Conversa não encontrada");

  const dto = serializeConversation(updated, row.contact);
  publish(session.organizationId, {
    type: "conversation.updated",
    data: { conversation: dto },
  });
  await logTrace({
    organizationId: session.organizationId,
    conversationId: id,
    type: "conversation.transferred",
    memberId: session.memberId,
    detail: { toMemberId: body.data.targetMemberId, departmentId },
  });

  return Response.json({ conversation: dto });
});
