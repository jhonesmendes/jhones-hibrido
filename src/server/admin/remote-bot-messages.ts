import { decryptClientSecret, type AdminClientRow } from "@/server/admin/client-registry";

export type RemoteBotMessage = { key: string; value: string; updatedAt: string };

export class RemoteBotMessagesError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

async function call<T>(client: AdminClientRow, init: RequestInit): Promise<T> {
  const res = await fetch(`${client.baseUrl}/api/internal/bot-messages`, {
    ...init,
    headers: {
      "x-license-control-secret": decryptClientSecret(client),
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  }).catch((cause) => {
    throw new RemoteBotMessagesError(
      cause instanceof Error ? cause.message : "Falha ao contatar a instância",
      502
    );
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (res.status === 404 && !body?.error) {
      throw new RemoteBotMessagesError("A instância precisa ser atualizada para editar as mensagens", 502);
    }
    // Erro de validação é do que o operador digitou; o resto é da instância.
    throw new RemoteBotMessagesError(
      body?.error?.message ?? `A instância respondeu ${res.status}`,
      res.status === 422 ? 422 : 502
    );
  }
  return res.json() as Promise<T>;
}

export function fetchRemoteBotMessages(client: AdminClientRow) {
  return call<{ available: boolean; messages: RemoteBotMessage[] }>(client, { method: "GET" });
}

export function saveRemoteBotMessages(client: AdminClientRow, messages: Record<string, string>) {
  return call<{ changed: string[]; messages: RemoteBotMessage[] }>(client, {
    method: "PUT",
    body: JSON.stringify({ messages }),
  });
}
