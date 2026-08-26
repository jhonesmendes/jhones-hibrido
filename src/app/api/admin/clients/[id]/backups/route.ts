import { apiError } from "@/lib/api";
import { requireOperatorSession } from "@/server/admin/require-operator";
import { getAdminClient } from "@/server/admin/client-registry";
import { fetchRemoteBackups, RemoteBackupError, triggerRemoteBackup } from "@/server/admin/remote-backup";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const denied = await requireOperatorSession();
  if (denied) return denied;

  const { id } = await params;
  const client = await getAdminClient(id);
  if (!client) return apiError(404, "not_found", "Cliente não encontrado");

  try {
    const { backups } = await fetchRemoteBackups(client);
    return Response.json({ backups });
  } catch (err) {
    if (err instanceof RemoteBackupError) {
      return apiError(502, "remote_backup_failed", err.message);
    }
    throw err;
  }
}

export async function POST(_req: Request, { params }: Params) {
  const denied = await requireOperatorSession();
  if (denied) return denied;

  const { id } = await params;
  const client = await getAdminClient(id);
  if (!client) return apiError(404, "not_found", "Cliente não encontrado");

  try {
    const result = await triggerRemoteBackup(client);
    return Response.json(result, { status: 202 });
  } catch (err) {
    if (err instanceof RemoteBackupError) {
      return apiError(502, "remote_backup_failed", err.message);
    }
    throw err;
  }
}
