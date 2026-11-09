import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const OWNER_EMAIL = (process.env.E2E_OWNER_EMAIL ?? "dono@e2e.test").toLowerCase();
/** Mesmo caminho de `storageState` no playwright.config.ts. */
export const AUTH_FILE = "test-results/.auth/owner.json";
export const CRED_FILE = "test-results/.auth/owner-credentials.json";
export const MOCKS = process.env.E2E_MOCKS === "1";

/**
 * Gera um convite do proprietário rodando o comando do ambiente
 * (E2E_OWNER_INVITE_CMD, com {email} substituído). Devolve o JSON do CLI.
 */
export function runOwnerInviteCommand(
  email = OWNER_EMAIL
): { ok: true; url: string; email: string } | { ok: false; code: string; message: string } {
  const template = process.env.E2E_OWNER_INVITE_CMD;
  if (!template) throw new Error("Defina E2E_OWNER_INVITE_CMD (ver playwright.config.ts)");
  let out: string;
  try {
    out = execSync(template.replaceAll("{email}", email), {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    // Código ≠ 0 (ex.: org_exists) ainda imprime o JSON em stdout.
    out = String((err as { stdout?: string }).stdout ?? "");
  }
  const line = out.trim().split("\n").reverse().find((l) => l.startsWith("{"));
  if (!line) throw new Error(`Saída inesperada do comando de convite: ${out.slice(0, 300)}`);
  return JSON.parse(line);
}

/** Caminho relativo (/register?owner=...) a partir do link absoluto. */
export function invitePath(url: string): string {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
}

export function saveCredentials(cred: { email: string; password: string }): void {
  mkdirSync(dirname(CRED_FILE), { recursive: true });
  writeFileSync(CRED_FILE, JSON.stringify(cred), { mode: 0o600 });
}

export function loadCredentials(): { email: string; password: string } {
  return JSON.parse(readFileSync(CRED_FILE, "utf8"));
}
