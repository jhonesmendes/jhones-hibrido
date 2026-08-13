import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import {
  getLicense,
  isLicenseActive,
  limitFor,
  withinLimit,
  type LimitKey,
} from "@/server/license/service";

function operatorContact(): { whatsapp: string | null; email: string | null } {
  const env = getEnv();
  return {
    whatsapp: env.OPERATOR_WHATSAPP ?? null,
    email: env.OPERATOR_EMAIL ?? null,
  };
}

/** Barra uma ação se a licença não está ativa ou o recurso já está no
 * limite do plano. Retorna `null` quando pode prosseguir — segue o mesmo
 * padrão de "checagem que devolve Response | null" usado no resto da API
 * (ex.: `requirePermission` lança, mas guards de rota tradicionalmente
 * retornam a Response pronta pro `if (guard) return guard;`). */
export async function requireLicenseLimit(
  organizationId: string,
  key: LimitKey,
  current: number
): Promise<Response | null> {
  const lic = await getLicense(organizationId);

  if (!lic || !isLicenseActive(lic)) {
    return apiError(
      402,
      "license_inactive",
      "A licença desta instância não está ativa. Fale com o suporte para regularizar."
    );
  }

  if (!withinLimit(lic, key, current)) {
    const contact = operatorContact();
    return Response.json(
      {
        error: {
          code: "license_limit_reached",
          message: "O plano atual não permite adicionar mais deste recurso.",
          plan: lic.type,
          key,
          current,
          limit: limitFor(lic, key),
          contact,
        },
      },
      { status: 403 }
    );
  }

  return null;
}
