import { apiError } from "@/lib/api";
import { requireOperatorSession } from "@/server/admin/require-operator";
import { getAdminClient } from "@/server/admin/client-registry";
import { fetchRemoteApiKeys, RemoteApiKeyError } from "@/server/admin/remote-api-keys";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const denied = await requireOperatorSession();
  if (denied) return denied;

  const { id } = await params;
  const client = await getAdminClient(id);
  if (!client) return apiError(404, "not_found", "Cliente não encontrado");

  try {
    const result = await fetchRemoteApiKeys(client);
    return Response.json(result);
  } catch (err) {
    if (err instanceof RemoteApiKeyError) {
      return apiError(502, "remote_api_keys_failed", err.message);
    }
    throw err;
  }
}
