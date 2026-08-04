import { apiError, withAuth } from "@/lib/api";
import { requireConversationAccess } from "@/lib/auth/require-permission";
import { getConversation } from "@/server/inbox/queries";
import { getConversationTrace } from "@/server/observability/trace";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Linha do tempo técnica da conversa (FR de diagnóstico): recebimento,
 * roteamento pra fila/caixa, atribuição, aceite/recusa e envio de resposta.
 * Mesma checagem de acesso do resto da conversa — quem pode ver a conversa
 * pode ver por que ela chegou (ou não) até quem devia atendê-la.
 */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const row = await getConversation(session.organizationId, id);
  if (!row) return apiError(404, "not_found", "Conversa não encontrada");
  await requireConversationAccess(session, row.conversation);

  const events = await getConversationTrace(session.organizationId, id);
  return Response.json({ events });
});
