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

export type MetaMediaMeta = {
  url: string;
  mimeType: string;
  fileSize: number;
};

/** Passo 1 de baixar mídia recebida: troca o media id por uma URL temporizada + metadados. */
export async function getMetaMediaMeta(
  mediaId: string,
  token: string
): Promise<MetaMediaMeta> {
  const env = getEnv();
  const url = `${env.META_GRAPH_BASE_URL}/${env.META_GRAPH_API_VERSION}/${mediaId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  }).catch((cause) => {
    throw new MetaApiError("Não foi possível contatar a API da Meta", {
      status: 0,
      details: cause,
    });
  });
  if (!res.ok) {
    throw new MetaApiError(`A Meta respondeu ${res.status} ao buscar metadados da mídia`, {
      status: res.status,
    });
  }
  const json = (await res.json()) as {
    url?: string;
    mime_type?: string;
    file_size?: number;
  };
  if (!json.url) {
    throw new MetaApiError("A Meta não devolveu a URL da mídia", { status: 502 });
  }
  return {
    url: json.url,
    mimeType: json.mime_type ?? "application/octet-stream",
    fileSize: json.file_size ?? 0,
  };
}

/** Passo 2: baixa os bytes da URL temporizada (exige o mesmo Bearer token). */
export async function downloadMetaMedia(url: string, token: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30000),
  }).catch((cause) => {
    throw new MetaApiError("Não foi possível baixar a mídia da Meta", {
      status: 0,
      details: cause,
    });
  });
  if (!res.ok) {
    throw new MetaApiError(`A Meta respondeu ${res.status} ao baixar a mídia`, {
      status: res.status,
    });
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Envio de mídia: primeiro upload (multipart) pro Graph, devolve o media id pra usar na mensagem. */
export async function uploadMetaMedia(
  phoneNumberId: string,
  token: string,
  file: { buffer: Buffer; mimeType: string; filename: string }
): Promise<string> {
  const env = getEnv();
  const url = `${env.META_GRAPH_BASE_URL}/${env.META_GRAPH_API_VERSION}/${phoneNumberId}/media`;
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append(
    "file",
    new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }),
    file.filename
  );
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(30000),
  }).catch((cause) => {
    throw new MetaApiError("Não foi possível enviar a mídia à Meta", {
      status: 0,
      details: cause,
    });
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // resposta não-JSON: preservada em details abaixo
  }
  if (!res.ok) {
    const err = (json as { error?: { message?: string } })?.error;
    throw new MetaApiError(err?.message ?? `A Meta respondeu ${res.status} ao subir a mídia`, {
      status: res.status,
      details: json ?? text,
    });
  }
  const id = (json as { id?: string })?.id;
  if (!id) throw new MetaApiError("A Meta não devolveu o ID da mídia", { status: 502 });
  return id;
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
