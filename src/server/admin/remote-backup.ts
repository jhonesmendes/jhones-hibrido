import { decryptClientSecret, type AdminClientRow } from "@/server/admin/client-registry";

export type RemoteBackup = {
  id: string;
  filename: string;
  sizeBytes: number | null;
  status: "running" | "done" | "failed";
  kind: "scheduled" | "manual" | "pre_restore";
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type RemoteBackupConfig = {
  enabled: boolean;
  hourOfDay: number;
  retentionCount: number;
};

export type RemoteRestoreLog = {
  id: string;
  sourceBackupId: string;
  preRestoreBackupId: string | null;
  status: "running" | "done" | "failed";
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export class RemoteBackupError extends Error {}

/** Timeout maior que o das outras chamadas remotas (audit/license/cost) —
 * disparar backup/restauração não espera o dump terminar (fire-and-forget
 * do lado da instância), mas a rede ainda pode ser mais lenta que o padrão
 * de 10s usado pra leituras simples. */
const TIMEOUT_MS = 20_000;

async function callInternalApi<T>(
  client: AdminClientRow,
  path: string,
  init?: RequestInit
): Promise<T> {
  const secret = decryptClientSecret(client);
  const res = await fetch(`${client.baseUrl}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      "x-license-control-secret": secret,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((cause) => {
    throw new RemoteBackupError(
      cause instanceof Error ? cause.message : "Falha ao contatar a instância"
    );
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new RemoteBackupError(body?.error?.message ?? `A instância respondeu ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchRemoteBackups(
  client: AdminClientRow
): Promise<{ backups: RemoteBackup[] }> {
  return callInternalApi(client, "/api/internal/backups");
}

export async function triggerRemoteBackup(client: AdminClientRow): Promise<{ started: boolean }> {
  return callInternalApi(client, "/api/internal/backups", { method: "POST" });
}

export async function deleteRemoteBackup(
  client: AdminClientRow,
  backupId: string
): Promise<{ deleted: boolean }> {
  return callInternalApi(client, `/api/internal/backups/${backupId}`, { method: "DELETE" });
}

export async function fetchRemoteBackupConfig(
  client: AdminClientRow
): Promise<{ config: RemoteBackupConfig }> {
  return callInternalApi(client, "/api/internal/backups/config");
}

export async function updateRemoteBackupConfig(
  client: AdminClientRow,
  patch: Partial<RemoteBackupConfig>
): Promise<{ config: RemoteBackupConfig }> {
  return callInternalApi(client, "/api/internal/backups/config", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function triggerRemoteRestore(
  client: AdminClientRow,
  backupId: string
): Promise<{ started: boolean; logId: string | null }> {
  return callInternalApi(client, `/api/internal/backups/${backupId}/restore`, { method: "POST" });
}

export async function fetchRemoteRestoreLogs(
  client: AdminClientRow
): Promise<{ restores: RemoteRestoreLog[] }> {
  return callInternalApi(client, "/api/internal/backups/restores");
}

/** Devolve a Response bruta (stream) — quem chama repassa o corpo direto
 * pro navegador do operador, sem materializar o dump inteiro em memória. */
export async function streamRemoteBackupDownload(
  client: AdminClientRow,
  backupId: string
): Promise<Response> {
  const secret = decryptClientSecret(client);
  const res = await fetch(`${client.baseUrl}/api/internal/backups/${backupId}/download`, {
    headers: { "x-license-control-secret": secret },
    signal: AbortSignal.timeout(5 * 60_000),
  }).catch((cause) => {
    throw new RemoteBackupError(cause instanceof Error ? cause.message : "Falha ao contatar a instância");
  });
  if (!res.ok) {
    throw new RemoteBackupError(`A instância respondeu ${res.status} ao baixar o backup`);
  }
  return res;
}
