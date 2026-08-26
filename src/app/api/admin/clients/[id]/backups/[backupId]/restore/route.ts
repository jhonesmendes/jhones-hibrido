import { apiError } from "@/lib/api";
import { requireOperatorSession } from "@/server/admin/require-operator";
import { getAdminClient } from "@/server/admin/client-registry";
import { RemoteBackupError, triggerRemoteRestore } from "@/server/admin/remote-backup";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; backupId: string }> };

/** Ação destrutiva — sobrescreve o banco da instância do cliente. O front
 * já exige confirmação forte antes de chegar aqui. */
export async function POST(_req: Request, { params }: Params) {
  const denied = await requireOperatorSession();
  if (denied) return denied;

  const { id, backupId } = await params;
  const client = await getAdminClient(id);
  if (!client) return apiError(404, "not_found", "Cliente não encontrado");

  try {
    const result = await triggerRemoteRestore(client, backupId);
    return Response.json(result, { status: 202 });
  } catch (err) {
    if (err instanceof RemoteBackupError) return apiError(502, "remote_backup_failed", err.message);
    throw err;
  }
}
