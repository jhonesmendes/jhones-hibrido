import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { getLicenseUsage } from "@/server/license/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const env = getEnv();
  if (!env.LICENSE_CONTROL_SECRET) {
    return apiError(503, "license_control_not_configured", "API interna de licença não configurada nesta instância");
  }
  const header = req.headers.get("x-license-control-secret");
  if (header !== env.LICENSE_CONTROL_SECRET) {
    return apiError(401, "unauthorized", "Segredo inválido");
  }

  const db = getDb();
  const orgs = await db
    .select({ id: schema.organization.id, name: schema.organization.name })
    .from(schema.organization)
    .orderBy(schema.organization.createdAt)
    .limit(1);
  const org = orgs[0];
  if (!org) {
    return apiError(404, "no_organization", "Nenhuma organização criada ainda nesta instância");
  }

  const usage = await getLicenseUsage(org.id);
  return Response.json({ organizationName: org.name, usage });
}
