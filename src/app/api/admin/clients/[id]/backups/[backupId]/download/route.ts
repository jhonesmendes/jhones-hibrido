import { apiError } from "@/lib/api";
import { requireOperatorSession } from "@/server/admin/require-operator";
import { getAdminClient } from "@/server/admin/client-registry";
import { RemoteBackupError, streamRemoteBackupDownload } from "@/server/admin/remote-backup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; backupId: string }> };

/** Repassa o stream do dump da instância pro navegador do operador — o
 * arquivo nunca fica retido nem persistido neste painel. */
export async function GET(_req: Request, { params }: Params) {
  const denied = await requireOperatorSession();
  if (denied) return denied;

  const { id, backupId } = await params;
  const client = await getAdminClient(id);
  if (!client) return apiError(404, "not_found", "Cliente não encontrado");

  try {
    const upstream = await streamRemoteBackupDownload(client, backupId);
    return new Response(upstream.body, {
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "content-disposition":
          upstream.headers.get("content-disposition") ?? "attachment; filename=\"backup.dump\"",
        ...(upstream.headers.get("content-length")
          ? { "content-length": upstream.headers.get("content-length")! }
          : {}),
      },
    });
  } catch (err) {
    if (err instanceof RemoteBackupError) return apiError(502, "remote_backup_failed", err.message);
    throw err;
  }
}
