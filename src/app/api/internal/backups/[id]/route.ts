import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { deleteBackup, getBackup } from "@/server/backup/engine";

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
  const b = await getBackup(id);
  if (!b) return apiError(404, "not_found", "Backup não encontrado");
  return Response.json({
    backup: {
      id: b.id,
      filename: b.filename,
      sizeBytes: b.sizeBytes,
      status: b.status,
      kind: b.kind,
      error: b.error,
      startedAt: b.startedAt.toISOString(),
      finishedAt: b.finishedAt?.toISOString() ?? null,
    },
  });
}

export async function DELETE(req: Request, { params }: Params) {
  const denied = requireControlSecret(req);
  if (denied) return denied;
  const { id } = await params;
  const ok = await deleteBackup(id);
  if (!ok) return apiError(404, "not_found", "Backup não encontrado");
  return Response.json({ deleted: true });
}
