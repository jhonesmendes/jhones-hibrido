import { z } from "zod";
import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import {
  applyLicenseUpdate,
  getLicense,
  getLicenseUsage,
} from "@/server/license/service";

export const dynamic = "force-dynamic";

/**
 * API interna consumida SÓ pelo painel central do operador (não pela sessão
 * normal do cliente) — autenticada por segredo compartilhado, nunca por
 * login. Sem `LICENSE_CONTROL_SECRET` configurado nesta instância, fica
 * travada por completo (falha fechada).
 */
function requireControlSecret(req: Request): Response | null {
  const env = getEnv();
  if (!env.LICENSE_CONTROL_SECRET) {
    return apiError(503, "license_control_not_configured", "API interna de licença não configurada nesta instância");
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

  const [usage, lic] = await Promise.all([
    getLicenseUsage(organizationId),
    getLicense(organizationId),
  ]);

  return Response.json({ license: lic, usage });
}

const patchSchema = z.object({
  type: z.enum(["trial", "starter", "business", "enterprise"]),
  status: z.enum(["active", "expired", "suspended"]),
  maxOfficialNumbers: z.number().int().min(0),
  maxWebNumbers: z.number().int().min(0),
  maxDepartments: z.number().int().min(0),
  maxAdmins: z.number().int().min(0),
  maxAgents: z.number().int().min(0),
  addonAgents: z.number().int().min(0),
  hideOwner: z.boolean(),
  expiresAt: z.string().nullable(),
  trialEndsAt: z.string().nullable(),
  notes: z.string().nullable().optional(),
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

  const lic = await applyLicenseUpdate(organizationId, {
    ...body.data,
    expiresAt: body.data.expiresAt ? new Date(body.data.expiresAt) : null,
    trialEndsAt: body.data.trialEndsAt ? new Date(body.data.trialEndsAt) : null,
  });

  return Response.json({ license: lic });
}
