import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireOperatorSession } from "@/server/admin/require-operator";
import { getAdminClient } from "@/server/admin/client-registry";
import {
  fetchRemoteBackupConfig,
  RemoteBackupError,
  updateRemoteBackupConfig,
} from "@/server/admin/remote-backup";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const denied = await requireOperatorSession();
  if (denied) return denied;

  const { id } = await params;
  const client = await getAdminClient(id);
  if (!client) return apiError(404, "not_found", "Cliente não encontrado");

  try {
    const { config } = await fetchRemoteBackupConfig(client);
    return Response.json({ config });
  } catch (err) {
    if (err instanceof RemoteBackupError) return apiError(502, "remote_backup_failed", err.message);
    throw err;
  }
}

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  hourOfDay: z.number().int().min(0).max(23).optional(),
  retentionCount: z.number().int().min(1).max(90).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const denied = await requireOperatorSession();
  if (denied) return denied;

  const { id } = await params;
  const client = await getAdminClient(id);
  if (!client) return apiError(404, "not_found", "Cliente não encontrado");

  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  try {
    const { config } = await updateRemoteBackupConfig(client, body.data);
    return Response.json({ config });
  } catch (err) {
    if (err instanceof RemoteBackupError) return apiError(502, "remote_backup_failed", err.message);
    throw err;
  }
}
