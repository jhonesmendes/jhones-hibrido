import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * Sessão do operador do painel central — deliberadamente simples: um único
 * operador, credencial fixa por env var (sem tabela de usuário nem
 * recuperação de senha). Cookie assinado por HMAC-SHA256, sem estado no
 * servidor (não precisa de tabela de sessão nem de banco pra validar).
 */

const COOKIE_NAME = "vocero_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

type SessionPayload = { email: string; exp: number };

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function requireAdminSessionSecret(): string {
  const secret = getEnv().ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET não configurado — painel central indisponível");
  }
  return secret;
}

export function createSessionCookieValue(email: string): string {
  const secret = requireAdminSessionSecret();
  const payload: SessionPayload = { email, exp: Date.now() + SESSION_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded, secret);
  return `${encoded}.${signature}`;
}

export function verifySessionCookieValue(value: string | undefined): SessionPayload | null {
  if (!value) return null;
  const secret = getEnv().ADMIN_SESSION_SECRET;
  if (!secret) return null;

  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export { COOKIE_NAME as ADMIN_SESSION_COOKIE };

/** Compara email/senha contra as env vars do operador — constant-time pra
 * não vazar tempo de comparação. */
export function checkOperatorCredentials(email: string, password: string): boolean {
  const env = getEnv();
  if (!env.ADMIN_OPERATOR_EMAIL || !env.ADMIN_OPERATOR_PASSWORD) return false;

  const emailOk = constantTimeStringEqual(email, env.ADMIN_OPERATOR_EMAIL);
  const passOk = constantTimeStringEqual(password, env.ADMIN_OPERATOR_PASSWORD);
  return emailOk && passOk;
}

function constantTimeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Ainda compara (tamanho diferente) pra não vazar o tamanho via timing.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
