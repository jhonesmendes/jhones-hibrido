import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { queryTraceEvents } from "@/server/observability/trace";

export const dynamic = "force-dynamic";

/**
 * API interna consumida SÓ pelo painel central do operador (mesmo padrão de
 * `/api/internal/audit-log`) — rastro técnico (mensagem/fila) de TODAS as
 * conversas da instância, não só uma (diferente do `/api/conversations/[id]
 * /trace` usado dentro do inbox).
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
  const type = url.searchParams.get("type") ?? undefined;
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const { entries, nextCursor } = await queryTraceEvents(organizationId, {
    type,
    since: since ? new Date(since) : undefined,
    until: until ? new Date(until) : undefined,
    cursor,
  });

  return Response.json({ entries, nextCursor });
}
