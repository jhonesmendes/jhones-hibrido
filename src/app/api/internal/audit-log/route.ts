import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { queryAuditLog } from "@/server/audit/query";

export const dynamic = "force-dynamic";

/**
 * API interna consumida SÓ pelo painel central do operador (mesmo padrão de
 * `/api/internal/license` e `/api/internal/cost-report`) — auditoria desta
 * instância, sem filtro de departamento (não existe essa dimensão aqui).
 */
function requireControlSecret(req: Request): Response | null {
  const env = getEnv();
  if (!env.LICENSE_CONTROL_SECRET) {
    return apiError(503, "license_control_not_configured", "API interna não configurada nesta instância");
  }
  const header = req.headers.get("x-license-control-secret");
  if (header !== env.LICENSE_CONTROL_SECRET) {
    return apiError(401, "unauthorized", "Segredo inválido");
  }
  return null;
}

async function getInstanceOrganizationId(): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .orderBy(schema.organization.createdAt)
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function GET(req: Request) {
  const denied = requireControlSecret(req);
  if (denied) return denied;

  const organizationId = await getInstanceOrganizationId();
  if (!organizationId) {
    return apiError(404, "no_organization", "Nenhuma organização criada ainda nesta instância");
  }

  const url = new URL(req.url);
  const memberId = url.searchParams.get("memberId") ?? undefined;
  const action = url.searchParams.get("action") ?? undefined;
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const { entries, nextCursor } = await queryAuditLog(organizationId, {
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
}
