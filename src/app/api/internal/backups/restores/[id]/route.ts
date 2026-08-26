import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getRestoreLog } from "@/server/backup/engine";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

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

export async function GET(req: Request, { params }: Params) {
  const denied = requireControlSecret(req);
  if (denied) return denied;
  const { id } = await params;
  const r = await getRestoreLog(id);
  if (!r) return apiError(404, "not_found", "Restauração não encontrada");
  return Response.json({
    restore: {
      id: r.id,
      sourceBackupId: r.sourceBackupId,
      preRestoreBackupId: r.preRestoreBackupId,
      status: r.status,
      error: r.error,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    },
  });
}
