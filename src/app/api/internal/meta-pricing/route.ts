import { z } from "zod";
import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { listPricingRules, seedDefaultPricingIfMissing, setPricingRule } from "@/server/billing/pricing";

export const dynamic = "force-dynamic";

/**
 * API interna consumida SÓ pelo painel central do operador (mesmo padrão de
 * `/api/internal/license`) — o operador acompanha a tabela de preços da
 * Meta e empurra o valor atual pra cada instância; o cliente final nunca
 * edita isso.
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

/** A org desta instância — sempre a mais antiga (só existe 1 de verdade). */
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

  await seedDefaultPricingIfMissing(organizationId);
  const rules = await listPricingRules(organizationId);
  return Response.json({ rules });
}

const patchSchema = z.object({
  category: z.enum(["marketing", "utility", "authentication"]),
  priceBrl: z.number().min(0),
});

export async function PATCH(req: Request) {
  const denied = requireControlSecret(req);
  if (denied) return denied;

  const organizationId = await getInstanceOrganizationId();
  if (!organizationId) {
    return apiError(404, "no_organization", "Nenhuma organização criada ainda nesta instância");
  }

  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return apiError(422, "invalid_body", "Corpo inválido");
  }

  const rule = await setPricingRule(organizationId, body.data.category, body.data.priceBrl);
  return Response.json({ rule });
}
