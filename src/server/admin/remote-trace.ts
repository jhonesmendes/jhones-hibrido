import { decryptClientSecret, type AdminClientRow } from "@/server/admin/client-registry";

export type RemoteTraceEntry = {
  id: string;
  type: string;
  channel: string | null;
  channelId: string | null;
  memberId: string | null;
  memberName: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
  conversationId: string | null;
  contactName: string | null;
};

export class RemoteTraceError extends Error {}

async function callInternalApi<T>(client: AdminClientRow, path: string): Promise<T> {
  const secret = decryptClientSecret(client);
  const res = await fetch(`${client.baseUrl}${path}`, {
    headers: { "x-license-control-secret": secret },
    signal: AbortSignal.timeout(10_000),
  }).catch((cause) => {
    throw new RemoteTraceError(cause instanceof Error ? cause.message : "Falha ao contatar a instância");
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new RemoteTraceError(body?.error?.message ?? `A instância respondeu ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchRemoteTraceLog(
  client: AdminClientRow,
  query: { type?: string; since?: string; until?: string; cursor?: string }
): Promise<{ entries: RemoteTraceEntry[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (query.type) params.set("type", query.type);
  if (query.since) params.set("since", query.since);
  if (query.until) params.set("until", query.until);
  if (query.cursor) params.set("cursor", query.cursor);
  return callInternalApi(client, `/api/internal/trace-log?${params.toString()}`);
}
