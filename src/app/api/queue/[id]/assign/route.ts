import { apiError, withAuth } from "@/lib/api";
import { acceptQueuedConversation } from "@/server/queue/manager";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** "Aceitar" no toast de nova conversa — só quem foi designado pode aceitar
 * (claim atômico em acceptQueuedConversation garante isso mesmo sob corrida). */
export const POST = withAuth(async (session, _req: Request, { params }: Params) => {
  const { id } = await params;
  const result = await acceptQueuedConversation(id, session.memberId);
  if (!result.ok) {
    return apiError(
      409,
      "not_assignable",
      "Esta conversa não está mais designada a você (pode ter expirado ou sido repassada)"
    );
  }
  return Response.json({ ok: true, conversationId: result.conversationId });
});
