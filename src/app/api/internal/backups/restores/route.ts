import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { listRestoreLogs } from "@/server/backup/engine";

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

  const logs = await listRestoreLogs();
  return Response.json({
    restores: logs.map((r) => ({
      id: r.id,
      sourceBackupId: r.sourceBackupId,
      preRestoreBackupId: r.preRestoreBackupId,
      status: r.status,
      error: r.error,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    })),
  });
}
