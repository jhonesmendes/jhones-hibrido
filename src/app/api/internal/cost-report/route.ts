import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { getMetaCostReport } from "@/server/billing/cost-report";
import type { DashboardPeriod } from "@/server/dashboard/queries";

export const dynamic = "force-dynamic";

const VALID_PERIODS: DashboardPeriod[] = ["today", "7d", "30d"];

/**
 * API interna consumida SÓ pelo painel central do operador (mesmo padrão de
 * `/api/internal/license`) — visão consolidada de custo Meta desta
 * instância, sem filtro de departamento (equivalente à visão do owner).
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
  const periodParam = url.searchParams.get("period");
  const period: DashboardPeriod = VALID_PERIODS.includes(periodParam as DashboardPeriod)
    ? (periodParam as DashboardPeriod)
    : "30d";

  const report = await getMetaCostReport(organizationId, null, period);
  return Response.json({ report, period });
}
