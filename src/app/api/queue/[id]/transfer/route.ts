import { apiError, withAuth } from "@/lib/api";
import { declineQueuedConversation } from "@/server/queue/manager";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** "Repassar" no toast de nova conversa — devolve à fila e tenta designar
 * outro agente do departamento imediatamente. */
export const POST = withAuth(async (session, _req: Request, { params }: Params) => {
  const { id } = await params;
  const result = await declineQueuedConversation(id, session.memberId);
  if (!result.ok) {
    return apiError(
      409,
      "not_assignable",
      "Esta conversa não está mais designada a você"
    );
  }
  return Response.json({ ok: true });
});
