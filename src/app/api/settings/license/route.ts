import { withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getOrSeedLicense, getLicenseUsage, isLicenseActive, limitFor } from "@/server/license/service";

export const dynamic = "force-dynamic";

/** Autoatendimento: qualquer membro autenticado vê o estado da própria
 * licença (owner/admin usam pra decidir se falam com o suporte). Org sem
 * licença ainda (criada antes dessa feature) ganha um trial na hora. */
export const GET = withAuth(async (session) => {
  const [lic, usage] = await Promise.all([
    getOrSeedLicense(session.organizationId),
    getLicenseUsage(session.organizationId),
  ]);
  const env = getEnv();

  return Response.json({
    license: {
      type: lic.type,
      status: lic.status,
      active: isLicenseActive(lic),
      hideOwner: lic.hideOwner,
      expiresAt: lic.expiresAt?.toISOString() ?? null,
      trialEndsAt: lic.trialEndsAt?.toISOString() ?? null,
      limits: {
        maxOfficialNumbers: limitFor(lic, "maxOfficialNumbers"),
        maxWebNumbers: limitFor(lic, "maxWebNumbers"),
        maxDepartments: limitFor(lic, "maxDepartments"),
        maxAdmins: limitFor(lic, "maxAdmins"),
        maxAgents: limitFor(lic, "maxAgents"),
      },
      addonAgents: lic.addonAgents,
      baseAgents: lic.maxAgents,
    },
    usage,
    contact: { whatsapp: env.OPERATOR_WHATSAPP ?? null, email: env.OPERATOR_EMAIL ?? null },
  });
});
