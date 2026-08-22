import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { listApiKeys } from "@/server/integrations/api-keys";

export const dynamic = "force-dynamic";

/**
 * API interna consumida SÓ pelo painel central do operador (mesmo padrão de
 * `/api/internal/license`/`/api/internal/cost-report`) — visão só-leitura
 * das chaves de integração desta instância (nunca o token/hash, só
 * metadados). Criação/revogação continuam exclusivas de Configurações →
 * Integrações, dentro da própria instância.
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

  const keys = await listApiKeys(organizationId);
  return Response.json({
    keys: keys.map((k) => ({
      ...k,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
      revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
    })),
  });
}
