import { desc, eq, gte, lte, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export type AuditEntry = {
  id: string;
  memberId: string | null;
  memberName: string | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type AuditQuery = {
  memberId?: string;
  action?: string;
  since?: Date;
  until?: Date;
  /** `createdAt` (ISO) do último item já visto — devolve só o que é mais
   * antigo que isso (paginação por keyset, não offset). */
  cursor?: string;
  limit?: number;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Motor único de consulta de auditoria — usado tanto pela tela do cliente
 * (`/api/settings/audit`) quanto pela API interna que o painel central
 * consome (`/api/internal/audit-log`), pra não ter duas implementações da
 * mesma query divergindo com o tempo.
 */
export async function queryAuditLog(
  organizationId: string,
  q: AuditQuery
): Promise<{ entries: AuditEntry[]; nextCursor: string | null }> {
  const db = getDb();
  const limit = Math.min(q.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

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
        organizationId,
        q.memberId ? eq(schema.auditLog.memberId, q.memberId) : undefined,
        q.action ? eq(schema.auditLog.action, q.action) : undefined,
        q.since ? gte(schema.auditLog.createdAt, q.since) : undefined,
        q.until ? lte(schema.auditLog.createdAt, q.until) : undefined,
        q.cursor ? lt(schema.auditLog.createdAt, new Date(q.cursor)) : undefined
      )
    )
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]!.createdAt.toISOString() : null;

  return { entries: page, nextCursor };
}
