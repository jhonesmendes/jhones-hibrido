import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getBackupConfig, updateBackupConfig } from "@/server/backup/config";

export const dynamic = "force-dynamic";

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

export async function GET(req: Request) {
  const denied = requireControlSecret(req);
  if (denied) return denied;
  return Response.json({ config: await getBackupConfig() });
}

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  hourOfDay: z.number().int().min(0).max(23).optional(),
  retentionCount: z.number().int().min(1).max(90).optional(),
});

export async function PATCH(req: Request) {
  const denied = requireControlSecret(req);
  if (denied) return denied;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  return Response.json({ config: await updateBackupConfig(body.data) });
}
