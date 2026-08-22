import { apiError } from "@/lib/api";
import { requireOperatorSession } from "@/server/admin/require-operator";
import { getAdminClient } from "@/server/admin/client-registry";
import { fetchRemoteTraceLog, RemoteTraceError } from "@/server/admin/remote-trace";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const denied = await requireOperatorSession();
  if (denied) return denied;

  const { id } = await params;
  const client = await getAdminClient(id);
  if (!client) return apiError(404, "not_found", "Cliente não encontrado");

  const url = new URL(req.url);
  try {
    const result = await fetchRemoteTraceLog(client, {
      type: url.searchParams.get("type") ?? undefined,
      since: url.searchParams.get("since") ?? undefined,
      until: url.searchParams.get("until") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof RemoteTraceError) {
      return apiError(502, "remote_trace_failed", err.message);
    }
    throw err;
  }
}
