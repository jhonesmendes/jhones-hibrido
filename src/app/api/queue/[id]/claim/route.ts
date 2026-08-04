import { apiError, withAuth } from "@/lib/api";
import { claimQueuedConversation } from "@/server/queue/manager";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Auto-atribuição (Sprint Q4, modo `manual`): agente do departamento pega
 * uma conversa `waiting` direto da tela de fila. */
export const POST = withAuth(async (session, _req: Request, { params }: Params) => {
  const { id } = await params;
  const result = await claimQueuedConversation(id, session.memberId);
  if (!result.ok) {
    return apiError(
      409,
      "not_claimable",
      "Esta conversa não está mais disponível na fila (já foi pega ou você não pertence ao departamento)"
    );
  }
  return Response.json({ ok: true });
});
