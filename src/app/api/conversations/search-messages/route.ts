import { withAuth } from "@/lib/api";
import { resolvePermissions } from "@/lib/auth/require-permission";
import { searchMessageConversationIds } from "@/server/inbox/queries";

export const dynamic = "force-dynamic";

/**
 * Devolve os IDs de conversa cujo histórico de mensagens contém o termo
 * buscado — complementa `GET /api/conversations` (que já traz nome/telefone/
 * última mensagem) pra a busca da caixa de entrada também achar texto
 * antigo enterrado numa conversa, não só o que já está na lista visível.
 */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ conversationIds: [] });

  let assignedToFilter: string | undefined;
  const effective = await resolvePermissions(session.memberId, session.role);
  if (!effective.has("conversations:view_all")) {
    assignedToFilter = session.memberId;
  }

  const conversationIds = await searchMessageConversationIds(
    session.organizationId,
    q,
    assignedToFilter,
    session.activeDepartmentId ?? undefined
  );
  return Response.json({ conversationIds });
});
