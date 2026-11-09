/**
 * Modo embutido (spec 010): o Vocero aberto num iframe de um sistema do
 * cliente (ex.: painel do Sankhya). Módulo sem dependências de Node — é
 * usado pelo middleware (runtime edge) e pelo servidor.
 *
 * `EMBED_ALLOWED_ORIGINS` lista quem pode embutir. Vazia → ninguém de fora
 * (anti-clickjacking): só o próprio Vocero.
 */

/** Cookie particionado que lembra o modo embutido dentro do quadro. */
export const EMBED_COOKIE = "vocero_embed";
/** Cabeçalho interno (middleware → layout); o do cliente é descartado. */
export const EMBED_HEADER = "x-vocero-embed";

// Origem https (curinga de subdomínio e de porta aceitos, como no CSP) ou http só para
// localhost/127.0.0.1 (testes). Sem caminho, sem barra no fim.
// `:*` = qualquer porta do mesmo host (ex.: bases de produção e de teste do
// Sankhya no mesmo servidor, cada uma numa porta).
const ORIGIN_RE = /^https:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*(:(\d{1,5}|\*))?$/;
const LOCAL_HTTP_RE = /^http:\/\/(localhost|127\.0\.0\.1|[a-z0-9-]+\.localhost|[a-z0-9-]+\.test)(:\d{1,5})?$/;

export type EmbedOrigins = { valid: string[]; invalid: string[] };

export function parseEmbedOrigins(raw: string | undefined | null): EmbedOrigins {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of (raw ?? "").split(/[\s,]+/)) {
    const value = part.trim().replace(/\/+$/, "").toLowerCase();
    if (!value) continue;
    if (ORIGIN_RE.test(value) || LOCAL_HTTP_RE.test(value)) {
      if (!valid.includes(value)) valid.push(value);
    } else {
      invalid.push(part.trim());
    }
  }
  return { valid, invalid };
}

/** Cabeçalhos anti-enquadramento para uma resposta. */
export function framingHeaders(opts: {
  origins: string[];
  adminHost: boolean;
}): Record<string, string> {
  if (opts.adminHost) {
    return {
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
    };
  }
  const csp = ["frame-ancestors", "'self'", ...opts.origins].join(" ");
  // X-Frame-Options não aceita lista de origens: com origens configuradas
  // vale só o CSP (todos os navegadores atuais o respeitam).
  return opts.origins.length === 0
    ? { "Content-Security-Policy": csp, "X-Frame-Options": "SAMEORIGIN" }
    : { "Content-Security-Policy": csp };
}

/**
 * Cookies precisam de `SameSite=None; Secure; Partitioned` para valer dentro
 * de um iframe de outro site. Só faz sentido com origens configuradas e com
 * o Vocero em https (ou localhost, que os navegadores tratam como seguro).
 */
export function iframeCookiesEnabled(origins: string[], appBaseUrl: string | undefined): boolean {
  if (origins.length === 0 || !appBaseUrl) return false;
  try {
    const url = new URL(appBaseUrl);
    return (
      url.protocol === "https:" ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

/** Decide o modo embutido a partir do `?embed=` e do cookie. */
export function resolveEmbedMode(param: string | null, cookie: string | undefined): {
  embed: boolean;
  setCookie: "on" | "off" | null;
} {
  if (param === "1") return { embed: true, setCookie: cookie === "1" ? null : "on" };
  if (param === "0") return { embed: false, setCookie: cookie ? "off" : null };
  return { embed: cookie === "1", setCookie: null };
}
