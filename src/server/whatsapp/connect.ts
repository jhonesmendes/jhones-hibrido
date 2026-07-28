import { graphRequest, MetaApiError } from "@/lib/meta/client";

export type ConnectionCheck =
  | {
      ok: true;
      displayPhoneNumber: string;
      verifiedName: string | null;
    }
  | { ok: false; code: "invalid_token" | "meta_unavailable" | "meta_error"; message: string };

/**
 * Valida token↔número contra a Graph API SEM persistir nada (FR-040):
 * um GET do número com o token deve devolver seu display_phone_number.
 */
export async function testConnection(
  phoneNumberId: string,
  token: string
): Promise<ConnectionCheck> {
  try {
    const res = await graphRequest<{
      display_phone_number?: string;
      verified_name?: string;
      id: string;
    }>(`${phoneNumberId}?fields=display_phone_number,verified_name`, {
      token,
    });
    if (!res.display_phone_number) {
      return {
        ok: false,
        code: "meta_error",
        message:
          "A Meta não devolveu o número: verifique se o Phone Number ID está correto",
      };
    }
    return {
      ok: true,
      displayPhoneNumber: res.display_phone_number,
      verifiedName: res.verified_name ?? null,
    };
  } catch (err) {
    if (err instanceof MetaApiError) {
      if (err.isAuthError) {
        return {
          ok: false,
          code: "invalid_token",
          message:
            "O token não é válido ou expirou. Verifique se corresponde a este número (modo direto: token de usuário do sistema; modo agência: token entregue pelo seu backend).",
        };
      }
      if (err.status === 0 || err.status >= 500) {
        return {
          ok: false,
          code: "meta_unavailable",
          message: "A Meta não está disponível no momento; tente de novo",
        };
      }
      return { ok: false, code: "meta_error", message: err.message };
    }
    throw err;
  }
}

/**
 * Inscreve o app na WABA após salvar (necessário para receber webhooks em
 * modo direto). Best-effort: no modo agência o override é configurado pelo
 * backend da agência e esta chamada pode não se aplicar.
 */
export async function subscribeAppToWaba(
  wabaId: string,
  token: string
): Promise<void> {
  try {
    await graphRequest(`${wabaId}/subscribed_apps`, {
      method: "POST",
      token,
    });
  } catch (err) {
    console.warn(
      "[connect] subscribed_apps falhou (esperado no modo agência):",
      err instanceof Error ? err.message : err
    );
  }
}
