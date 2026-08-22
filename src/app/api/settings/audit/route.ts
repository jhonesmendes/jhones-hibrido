import { apiError, withAuth } from "@/lib/api";
import { queryAuditLog } from "@/server/audit/query";

export const dynamic = "force-dynamic";

/** Lista de auditoria (US5), filtrável por membro/ação/período — owner/admin only. */
export const GET = withAuth(async (session, req: Request) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin veem a auditoria");
  }
  const url = new URL(req.url);
  const memberId = url.searchParams.get("memberId") ?? undefined;
  const action = url.searchParams.get("action") ?? undefined;
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const { entries, nextCursor } = await queryAuditLog(session.organizationId, {
    memberId,
    action,
    since: since ? new Date(since) : undefined,
    until: until ? new Date(until) : undefined,
    cursor,
  });

  return Response.json({
    entries: entries.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    nextCursor,
  });
});
