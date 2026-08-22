import { decryptClientSecret, type AdminClientRow } from "@/server/admin/client-registry";

export type RemoteApiKey = {
  id: string;
  name: string;
  tokenLast4: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export class RemoteApiKeyError extends Error {}

export async function fetchRemoteApiKeys(client: AdminClientRow): Promise<{ keys: RemoteApiKey[] }> {
  const secret = decryptClientSecret(client);
  const res = await fetch(`${client.baseUrl}/api/internal/api-keys`, {
    headers: { "x-license-control-secret": secret },
    signal: AbortSignal.timeout(10_000),
  }).catch((cause) => {
    throw new RemoteApiKeyError(cause instanceof Error ? cause.message : "Falha ao contatar a instância");
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new RemoteApiKeyError(body?.error?.message ?? `A instância respondeu ${res.status}`);
  }
  return res.json() as Promise<{ keys: RemoteApiKey[] }>;
}
