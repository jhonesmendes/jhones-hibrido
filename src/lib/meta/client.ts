import { getEnv } from "@/lib/env";

/**
 * Cliente próprio da Graph API da Meta (WhatsApp Cloud API).
 * Única fronteira de saída para a Meta (Constituição II): toda request passa
 * por graphRequest. No self-test, META_GRAPH_BASE_URL aponta para o wa-mock.
 */

export class MetaApiError extends Error {
  status: number;
  code: number | null;
  type: string | null;
  details: unknown;

  constructor(
    message: string,
    opts: { status: number; code?: number | null; type?: string | null; details?: unknown }
  ) {
    super(message);
    this.name = "MetaApiError";
    this.status = opts.status;
    this.code = opts.code ?? null;
    this.type = opts.type ?? null;
    this.details = opts.details;
  }

  /** Token vencido/revogado → a conexão requer reautenticação. */
  get isAuthError(): boolean {
    return (
      this.status === 401 || this.code === 190 || this.type === "OAuthException"
    );
  }
}

export async function graphRequest<T>(
  path: string,
  opts: {
    method?: "GET" | "POST" | "DELETE";
    token: string;
    body?: unknown;
  }
): Promise<T> {
  const env = getEnv();
  const url = `${env.META_GRAPH_BASE_URL}/${env.META_GRAPH_API_VERSION}/${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        ...(opts.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (cause) {
    throw new MetaApiError("Não foi possível contatar a API da Meta", {
      status: 0,
      details: cause,
    });
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // resposta não-JSON: o texto bruto é preservado em details
  }

  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: number; type?: string } })
      ?.error;
    throw new MetaApiError(err?.message ?? `A Meta respondeu ${res.status}`, {
      status: res.status,
      code: err?.code ?? null,
      type: err?.type ?? null,
      details: json ?? text,
    });
  }
  return json as T;
}

/**
 * Normaliza o destinatário para o envio. Números móveis do México chegam
 * da Meta como `521` + 10 dígitos (13 no total); enviar com esse `1` extra
 * produz o erro 131030 — envia-se como `52` + 10 dígitos.
 * O wa_id armazenado NÃO é modificado; isso se aplica só ao enviar.
 */
export function normalizeRecipient(waId: string): string {
  if (/^521\d{10}$/.test(waId)) {
    return `52${waId.slice(3)}`;
  }
  return waId;
}
