import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getMemberStatus, isAgentStatusValue, setMemberStatus } from "@/server/presence/status";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const status = await getMemberStatus(session.memberId);
  return Response.json({ status });
});

const putSchema = z.object({ status: z.string() });

/** Sprint Q1: só grava o status escolhido — sem lógica de roteamento
 * ainda (ver ROADMAP_queue_routing.md). */
export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  if (!isAgentStatusValue(body.data.status)) {
    return apiError(422, "invalid_status", "Status inválido");
  }
  await setMemberStatus(session.memberId, body.data.status);
  return Response.json({ ok: true, status: body.data.status });
});
