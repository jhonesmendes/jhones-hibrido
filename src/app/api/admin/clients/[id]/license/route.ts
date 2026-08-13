import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireOperatorSession } from "@/server/admin/require-operator";
import { getAdminClient } from "@/server/admin/client-registry";
import { pushRemoteLicense, RemoteLicenseError } from "@/server/admin/remote-license";
import { PLAN_LIMITS, type LicenseType } from "@/server/admin/plan-presets";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  type: z.enum(["trial", "starter", "business", "enterprise"]),
  status: z.enum(["active", "expired", "suspended"]),
  addonAgents: z.number().int().min(0).max(500),
  expiresAt: z.string().nullable(),
  trialEndsAt: z.string().nullable(),
  notes: z.string().nullable().optional(),
  // Enterprise (ou um plano negociado à parte) pode sobrescrever os limites
  // do preset — opcional, senão usa o preset do `type` escolhido.
  overrideLimits: z
    .object({
      maxOfficialNumbers: z.number().int().min(0),
      maxWebNumbers: z.number().int().min(0),
      maxDepartments: z.number().int().min(0),
      maxAdmins: z.number().int().min(0),
      maxAgents: z.number().int().min(0),
      hideOwner: z.boolean(),
    })
    .optional(),
});

/** Empurra uma licença nova pra instância do cliente (a instância grava
 * localmente — ver `PATCH /api/internal/license` do lado do cliente). */
export async function PATCH(req: Request, { params }: Params) {
  const denied = await requireOperatorSession();
  if (denied) return denied;

  const { id } = await params;
  const client = await getAdminClient(id);
  if (!client) return apiError(404, "not_found", "Cliente não encontrado");

  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const limits = body.data.overrideLimits ?? PLAN_LIMITS[body.data.type as LicenseType];

  try {
    const result = await pushRemoteLicense(client, {
      type: body.data.type,
      status: body.data.status,
      ...limits,
      addonAgents: body.data.addonAgents,
      expiresAt: body.data.expiresAt,
      trialEndsAt: body.data.trialEndsAt,
      notes: body.data.notes,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof RemoteLicenseError) {
      return apiError(502, "remote_license_failed", err.message);
    }
    throw err;
  }
}
