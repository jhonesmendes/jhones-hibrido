import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireOperatorSession } from "@/server/admin/require-operator";
import { getAdminClient } from "@/server/admin/client-registry";
import {
  fetchRemoteCostReport,
  fetchRemotePricingRules,
  pushRemotePricingRule,
  RemoteCostError,
} from "@/server/admin/remote-cost";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const VALID_PERIODS = ["today", "7d", "30d"] as const;

export async function GET(req: Request, { params }: Params) {
  const denied = await requireOperatorSession();
  if (denied) return denied;

  const { id } = await params;
  const client = await getAdminClient(id);
  if (!client) return apiError(404, "not_found", "Cliente não encontrado");

  const url = new URL(req.url);
  const periodParam = url.searchParams.get("period");
  const period = (VALID_PERIODS as readonly string[]).includes(periodParam ?? "")
    ? (periodParam as (typeof VALID_PERIODS)[number])
    : "30d";

  try {
    const [{ report }, { rules }] = await Promise.all([
      fetchRemoteCostReport(client, period),
      fetchRemotePricingRules(client),
    ]);
    return Response.json({ report, rules, period });
  } catch (err) {
    if (err instanceof RemoteCostError) {
      return apiError(502, "remote_cost_failed", err.message);
    }
    throw err;
  }
}

const patchSchema = z.object({
  category: z.enum(["marketing", "utility", "authentication"]),
  priceBrl: z.number().min(0),
});

/** Empurra um preço novo pra instância do cliente — ela grava localmente
 * (nova vigência, nunca sobrescreve o histórico — ver PATCH
 * `/api/internal/meta-pricing` do lado do cliente). */
export async function PATCH(req: Request, { params }: Params) {
  const denied = await requireOperatorSession();
  if (denied) return denied;

  const { id } = await params;
  const client = await getAdminClient(id);
  if (!client) return apiError(404, "not_found", "Cliente não encontrado");

  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  try {
    const result = await pushRemotePricingRule(client, body.data.category, body.data.priceBrl);
    return Response.json(result);
  } catch (err) {
    if (err instanceof RemoteCostError) {
      return apiError(502, "remote_cost_failed", err.message);
    }
    throw err;
  }
}
