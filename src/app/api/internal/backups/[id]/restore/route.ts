import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getBackup, startRestore } from "@/server/backup/engine";

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

/**
 * Dispara a restauração (destrutiva — sobrescreve o banco atual) a partir
 * deste backup. Fire-and-forget: tira um snapshot de segurança antes de
 * mexer em qualquer coisa (ver runRestore), então roda o pg_restore. O
 * painel poll `/api/internal/backups/restores/[logId]` pra acompanhar.
 */
export async function POST(req: Request, { params }: Params) {
  const denied = requireControlSecret(req);
  if (denied) return denied;
  const { id } = await params;
  const backup = await getBackup(id);
  if (!backup || backup.status !== "done") {
    return apiError(404, "not_found", "Backup não encontrado ou incompleto");
  }

  const logId = await startRestore(id);
  return Response.json({ started: true, logId }, { status: 202 });
}
