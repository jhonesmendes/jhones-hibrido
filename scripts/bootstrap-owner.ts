/**
 * Gera o convite do PROPRIETÁRIO de uma instância nova (spec 009).
 *
 * Dentro do container:  node bootstrap-owner.mjs --email dono@cliente.com.br
 * No repositório:       pnpm owner:invite -- --email dono@cliente.com.br
 *
 * Opções: --org "Nome do negócio"  --hours 72  --json
 *
 * Imprime o link de uso único (só no terminal, nunca no log do app). Rodar de
 * novo invalida o link anterior. Recusa se a instância já tem organização.
 */
import { readFileSync } from "node:fs";

function loadDotEnv(): void {
  let text: string;
  try {
    text = readFileSync(".env", "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!m) continue;
    const [, key, raw] = m;
    if (key && process.env[key] === undefined) {
      process.env[key] = (raw ?? "").replace(/^["']|["']$/g, "").trim();
    }
  }
}

function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === `--${name}`) return argv[i + 1];
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return undefined;
}

async function main(): Promise<number> {
  loadDotEnv();
  const asJson = process.argv.includes("--json");
  const email = arg("email");
  if (!email) {
    console.error('Uso: node bootstrap-owner.mjs --email dono@cliente.com.br [--org "Nome"] [--hours 72] [--json]');
    return 2;
  }
  const hoursRaw = arg("hours");
  const hours = hoursRaw ? Number(hoursRaw) : undefined;

  const { createOwnerInvite, OwnerInviteError } = await import("@/server/auth/owner-invite");
  const { getEnv } = await import("@/lib/env");
  const { getSql } = await import("@/lib/db");

  try {
    const invite = await createOwnerInvite({
      email,
      organizationName: arg("org") ?? null,
      expiresInHours: hours,
    });
    const base = getEnv().APP_BASE_URL.replace(/\/+$/, "");
    const url = `${base}${invite.path}`;
    if (asJson) {
      console.log(JSON.stringify({ ok: true, email: invite.email, url, expiresAt: invite.expiresAt.toISOString() }));
    } else {
      console.log(`Convite do proprietário criado para ${invite.email}`);
      console.log(`Válido até ${invite.expiresAt.toISOString()} · uso único`);
      console.log("");
      console.log(url);
    }
    return 0;
  } catch (err) {
    const code = err instanceof OwnerInviteError ? err.code : "error";
    const message = err instanceof Error ? err.message : String(err);
    if (asJson) console.log(JSON.stringify({ ok: false, code, message }));
    else console.error(`Não foi possível criar o convite: ${message}`);
    return code === "org_exists" ? 3 : 1;
  } finally {
    await getSql().end({ timeout: 5 }).catch(() => {});
  }
}

main().then((code) => process.exit(code));
