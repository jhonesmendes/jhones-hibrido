import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { listBackups, runBackup } from "@/server/backup/engine";

export const dynamic = "force-dynamic";

/** API interna consumida SÓ pelo painel central do operador (mesmo padrão
 * de `/api/internal/audit-log` e `/api/internal/license`). */
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

  const backups = await listBackups();
  return Response.json({
    backups: backups.map((b) => ({
      id: b.id,
      filename: b.filename,
      sizeBytes: b.sizeBytes,
      status: b.status,
      kind: b.kind,
      error: b.error,
      startedAt: b.startedAt.toISOString(),
      finishedAt: b.finishedAt?.toISOString() ?? null,
    })),
  });
}

/** Dispara um backup manual — fire-and-forget (o dump pode levar minutos
 * num banco grande; o painel poll a lista pra acompanhar o status). */
export async function POST(req: Request) {
  const denied = requireControlSecret(req);
  if (denied) return denied;

  void runBackup("manual").catch((err) => console.error("[backup] manual falhou:", err));
  return Response.json({ started: true }, { status: 202 });
}
