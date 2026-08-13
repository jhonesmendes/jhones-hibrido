"use client";

import { useState } from "react";
import type { LicenseLimitInfo } from "@/components/settings/license-limit-dialog";

/** Envolve uma chamada de API que pode bater no limite do plano (403
 * `license_limit_reached`) — se bater, guarda os dados pro
 * `<LicenseLimitDialog>` em vez de deixar o erro genérico aparecer. */
export function useLimitAction() {
  const [limitError, setLimitError] = useState<LicenseLimitInfo | null>(null);

  /** Devolve `true` quando a resposta ERA um limite de plano (já tratado —
   * o chamador deve parar ali, sem mostrar erro genérico). `false` = segue
   * o tratamento de erro normal do chamador. */
  async function runWithLimitCheck(res: Response, resourceLabel: string): Promise<boolean> {
    if (res.status !== 403) return false;
    const body = (await res
      .clone()
      .json()
      .catch(() => null)) as {
      error?: { code?: string; plan?: string; contact?: LicenseLimitInfo["contact"] };
    } | null;
    if (body?.error?.code !== "license_limit_reached") return false;
    setLimitError({
      plan: body.error.plan ?? "trial",
      resource: resourceLabel,
      contact: body.error.contact ?? { whatsapp: null, email: null },
    });
    return true;
  }

  return { limitError, clearLimitError: () => setLimitError(null), runWithLimitCheck };
}
