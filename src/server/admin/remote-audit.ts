import { decryptClientSecret, type AdminClientRow } from "@/server/admin/client-registry";

export type RemoteAuditEntry = {
  id: string;
  memberId: string | null;
  memberName: string | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  metadata: unknown;
  createdAt: string;
};

export class RemoteAuditError extends Error {}

async function callInternalApi<T>(client: AdminClientRow, path: string): Promise<T> {
  const secret = decryptClientSecret(client);
  const res = await fetch(`${client.baseUrl}${path}`, {
    headers: { "x-license-control-secret": secret },
    signal: AbortSignal.timeout(10_000),
  }).catch((cause) => {
    throw new RemoteAuditError(cause instanceof Error ? cause.message : "Falha ao contatar a instância");
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new RemoteAuditError(body?.error?.message ?? `A instância respondeu ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchRemoteAuditLog(
  client: AdminClientRow,
  query: { memberId?: string; action?: string; since?: string; until?: string; cursor?: string }
): Promise<{ entries: RemoteAuditEntry[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (query.memberId) params.set("memberId", query.memberId);
  if (query.action) params.set("action", query.action);
  if (query.since) params.set("since", query.since);
  if (query.until) params.set("until", query.until);
  if (query.cursor) params.set("cursor", query.cursor);
  return callInternalApi(client, `/api/internal/audit-log?${params.toString()}`);
}
