import { apiError } from "@/lib/api";
import { requireOperatorSession } from "@/server/admin/require-operator";
import { getAdminClient } from "@/server/admin/client-registry";
import { fetchRemoteAuditLog, RemoteAuditError } from "@/server/admin/remote-audit";

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
    const result = await fetchRemoteAuditLog(client, {
      memberId: url.searchParams.get("memberId") ?? undefined,
      action: url.searchParams.get("action") ?? undefined,
      since: url.searchParams.get("since") ?? undefined,
      until: url.searchParams.get("until") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof RemoteAuditError) {
      return apiError(502, "remote_audit_failed", err.message);
    }
    throw err;
  }
}
