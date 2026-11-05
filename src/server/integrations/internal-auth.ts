import { timingSafeEqual } from "node:crypto";
import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { verifyApiKey } from "@/server/integrations/api-keys";

/**
 * Autenticação da API interna de automações (`x-internal-key`), nunca por
 * sessão de usuário. Duas formas de chave:
 *
 * 1) Chave nomeada e revogável de Configurações → Integrações (preferida).
 * 2) `INTERNAL_API_KEY` (env var) — legado, resolve para a organização mais
 *    antiga da instância.
 */
export async function resolveInternalCaller(
  req: Request
): Promise<{ organizationId: string } | Response> {
  const header = req.headers.get("x-internal-key") ?? "";
  if (!header) return apiError(401, "unauthorized", "Chave inválida");

  const viaApiKey = await verifyApiKey(header);
  if (viaApiKey) return { organizationId: viaApiKey.organizationId };

  const env = getEnv();
  if (env.INTERNAL_API_KEY) {
    const expected = Buffer.from(env.INTERNAL_API_KEY);
    const got = Buffer.from(header);
    if (got.length === expected.length && timingSafeEqual(got, expected)) {
      const organizationId = await getInstanceOrganizationId();
      if (organizationId) return { organizationId };
    }
  }

  return apiError(401, "unauthorized", "Chave inválida");
}

/** A org desta instância — sempre a mais antiga (só existe 1 de verdade). */
export async function getInstanceOrganizationId(): Promise<string | null> {
  const rows = await getDb()
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .orderBy(schema.organization.createdAt)
    .limit(1);
  return rows[0]?.id ?? null;
}
