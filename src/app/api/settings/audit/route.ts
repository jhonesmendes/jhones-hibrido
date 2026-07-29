import { desc, eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/** Lista de auditoria (US5), filtrável por membro/ação — owner/admin only. */
export const GET = withAuth(async (session, req: Request) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin veem a auditoria");
  }
  const url = new URL(req.url);
  const memberId = url.searchParams.get("memberId") ?? undefined;
  const action = url.searchParams.get("action") ?? undefined;

  const db = getDb();
  const rows = await db
    .select({
      id: schema.auditLog.id,
      memberId: schema.auditLog.memberId,
      memberName: schema.user.name,
      action: schema.auditLog.action,
      resource: schema.auditLog.resource,
      resourceId: schema.auditLog.resourceId,
      ipAddress: schema.auditLog.ipAddress,
      metadata: schema.auditLog.metadata,
      createdAt: schema.auditLog.createdAt,
    })
    .from(schema.auditLog)
    .leftJoin(schema.member, eq(schema.auditLog.memberId, schema.member.id))
    .leftJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(
      scoped(
        schema.auditLog.organizationId,
        session.organizationId,
        memberId ? eq(schema.auditLog.memberId, memberId) : undefined,
        action ? eq(schema.auditLog.action, action) : undefined
      )
    )
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(PAGE_SIZE);

  return Response.json({
    entries: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  });
});
