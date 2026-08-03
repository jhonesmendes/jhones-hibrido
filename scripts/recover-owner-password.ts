/**
 * Fallback operacional: redefine a senha de um owner diretamente no banco,
 * sem depender de login, SMTP ou UI. Uso: quando o único owner perde acesso
 * (esqueceu a senha) e o SMTP ainda não está configurado (ou falhou) — nesse
 * caso não existe ninguém logado para gerar o link manual em Configurações.
 *
 * `pnpm recover:owner-password -- --email=owner@dominio.com --password=NovaSenha123`
 * (dentro do container: `node recover-owner-password.mjs --email=... --password=...`)
 * Sem --password, gera uma senha aleatória e imprime no terminal.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";
import * as schema from "@/lib/db/schema";

function loadEnvVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const env = readFileSync(".env", "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim();
  } catch {
    return undefined;
  }
}

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

const email = parseArg("email");
if (!email) {
  console.error("[recover] Uso: --email=owner@dominio.com [--password=NovaSenha]");
  process.exit(1);
}

const password = parseArg("password") ?? randomBytes(9).toString("base64url");
if (password.length < 8) {
  console.error("[recover] A senha precisa ter ao menos 8 caracteres");
  process.exit(1);
}

const url = loadEnvVar("DATABASE_URL");
if (!url) {
  console.error("[recover] DATABASE_URL não está definida");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(sql, { schema });

const rows = await db
  .select({ userId: schema.user.id, memberId: schema.member.id, role: schema.member.role })
  .from(schema.user)
  .innerJoin(schema.member, eq(schema.member.userId, schema.user.id))
  .where(eq(schema.user.email, email))
  .limit(1);

const target = rows[0];
if (!target) {
  console.error(`[recover] Nenhum membro encontrado com o e-mail ${email}`);
  await sql.end();
  process.exit(1);
}
if (target.role !== "owner") {
  console.error(
    `[recover] ${email} não é owner (papel atual: ${target.role}) — este fallback é só para desbloqueio do proprietário`
  );
  await sql.end();
  process.exit(1);
}

const hashed = await hashPassword(password);
const updated = await db
  .update(schema.account)
  .set({ password: hashed })
  .where(and(eq(schema.account.userId, target.userId), eq(schema.account.providerId, "credential")))
  .returning({ id: schema.account.id });

if (updated.length === 0) {
  console.error(`[recover] Nenhuma credencial de senha encontrada para ${email}`);
  await sql.end();
  process.exit(1);
}

await db
  .update(schema.member)
  .set({ isActive: true })
  .where(eq(schema.member.id, target.memberId));

console.log(`[recover] Senha redefinida para ${email}.`);
console.log(`[recover] Nova senha: ${password}`);
console.log("[recover] Troque essa senha após o login.");
await sql.end();
process.exit(0);
