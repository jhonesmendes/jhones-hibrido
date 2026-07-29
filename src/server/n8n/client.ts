/**
 * Cliente REST do N8N do próprio operador/agência (Constituição II v2.2.0,
 * categoria 4) — único adaptador que fala com essa instância N8N; o domínio
 * (Campanhas) nunca monta URLs/headers por conta própria.
 */

export type N8nCredentials = { baseUrl: string; apiKey: string };

export type N8nWorkflow = {
  id: string;
  name: string;
  active: boolean;
  updatedAt: string | null;
};

export type N8nExecution = {
  id: string;
  workflowId: string;
  status: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
};

export class N8nApiError extends Error {
  code: "unauthorized" | "not_found" | "unavailable" | "error";
  constructor(code: N8nApiError["code"], message: string) {
    super(message);
    this.name = "N8nApiError";
    this.code = code;
  }
}

function baseApiUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function n8nRequest<T>(
  creds: N8nCredentials,
  path: string,
  init?: RequestInit,
  timeoutMs = 15_000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseApiUrl(creds.baseUrl)}${path}`, {
      ...init,
      headers: {
        // O header oficial do N8N; a chave jamais é logada.
        "X-N8N-API-KEY": creds.apiKey,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      throw new N8nApiError("unauthorized", "Chave de API do N8N inválida ou sem permissão");
    }
    if (res.status === 404) {
      throw new N8nApiError("not_found", "Recurso não encontrado no N8N");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new N8nApiError("error", `N8N respondeu ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof N8nApiError) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new N8nApiError("unavailable", `Não foi possível contatar o N8N: ${detail}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function listWorkflows(creds: N8nCredentials): Promise<N8nWorkflow[]> {
  const data = await n8nRequest<{
    data: { id: string; name: string; active: boolean; updatedAt?: string }[];
  }>(creds, "/api/v1/workflows");
  return (data.data ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    active: w.active,
    updatedAt: w.updatedAt ?? null,
  }));
}

export async function executeWorkflow(
  creds: N8nCredentials,
  workflowId: string
): Promise<{ executionId: string | null }> {
  const data = await n8nRequest<{ executionId?: string; id?: string }>(
    creds,
    `/api/v1/workflows/${encodeURIComponent(workflowId)}/execute`,
    { method: "POST" }
  );
  return { executionId: data.executionId ?? data.id ?? null };
}

export async function listExecutions(
  creds: N8nCredentials,
  workflowId?: string
): Promise<N8nExecution[]> {
  const qs = workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : "";
  const data = await n8nRequest<{
    data: {
      id: string;
      workflowId: string;
      status?: string;
      startedAt?: string;
      stoppedAt?: string;
    }[];
  }>(creds, `/api/v1/executions${qs}`);
  return (data.data ?? []).map((e) => ({
    id: e.id,
    workflowId: e.workflowId,
    status: e.status ?? null,
    startedAt: e.startedAt ?? null,
    stoppedAt: e.stoppedAt ?? null,
  }));
}
