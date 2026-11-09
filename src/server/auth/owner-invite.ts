import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

/**
 * Convite do proprietário (spec 009, US1).
 *
 * A instalação grava o e-mail do dono e gera um link de uso único. Enquanto a
 * instância não tem organização, é o ÚNICO caminho para criar a conta dona em
 * produção — fecha a corrida em que o primeiro visitante de /register virava
 * dono. O token em texto puro só existe no link; no banco fica o hash.
 */

export const OWNER_INVITE_DEFAULT_HOURS = 72;
export const OWNER_INVITE_MAX_HOURS = 30 * 24;

export type OwnerInviteRow = typeof schema.ownerInvite.$inferSelect;

export type OwnerInviteFailure = "invalid" | "expired" | "used" | "revoked" | "org_exists";

export const OWNER_INVITE_MESSAGE: Record<OwnerInviteFailure | "email_mismatch", string> = {
  invalid: "Convite inválido",
  expired: "Convite expirado — gere um novo na instalação",
  used: "Convite já utilizado — entre com o e-mail e a senha cadastrados",
  revoked: "Este convite foi substituído por um mais novo",
  org_exists: "Esta instância já tem proprietário — entre pela tela de login",
  email_mismatch: "Este convite é para outro e-mail",
};

export function hashOwnerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Regra pura: o convite ainda vale? (testável sem banco) */
export function evaluateOwnerInvite(
  row: Pick<OwnerInviteRow, "usedAt" | "revokedAt" | "expiresAt"> | undefined,
  now: Date
): { ok: true } | { ok: false; code: OwnerInviteFailure } {
  if (!row) return { ok: false, code: "invalid" };
  if (row.usedAt) return { ok: false, code: "used" };
  if (row.revokedAt) return { ok: false, code: "revoked" };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, code: "expired" };
  return { ok: true };
}

async function organizationCount(): Promise<number> {
  const rows = await getDb().select({ n: count() }).from(schema.organization);
  return rows[0]?.n ?? 0;
}

export class OwnerInviteError extends Error {
  constructor(
    public code: OwnerInviteFailure | "email_mismatch" | "bad_input",
    message: string
  ) {
    super(message);
    this.name = "OwnerInviteError";
  }
}

/**
 * Cria o convite do dono. Recusa se a instância já tem organização e
 * invalida qualquer convite anterior ainda pendente (só um vale por vez).
 */
export async function createOwnerInvite(params: {
  email: string;
  organizationName?: string | null;
  expiresInHours?: number;
  now?: Date;
}): Promise<{ id: string; token: string; path: string; email: string; expiresAt: Date }> {
  const email = normalizeEmail(params.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new OwnerInviteError("bad_input", "E-mail inválido");
  }
  const hours = params.expiresInHours ?? OWNER_INVITE_DEFAULT_HOURS;
  if (!Number.isFinite(hours) || hours <= 0 || hours > OWNER_INVITE_MAX_HOURS) {
    throw new OwnerInviteError(
      "bad_input",
      `Validade deve ficar entre 1 e ${OWNER_INVITE_MAX_HOURS} horas`
    );
  }
  if ((await organizationCount()) > 0) {
    throw new OwnerInviteError("org_exists", OWNER_INVITE_MESSAGE.org_exists);
  }

  const now = params.now ?? new Date();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const id = newId("ownerInvite");
  const organizationName = params.organizationName?.trim() || null;

  await getDb().transaction(async (tx) => {
    await tx
      .update(schema.ownerInvite)
      .set({ revokedAt: now })
      .where(and(isNull(schema.ownerInvite.usedAt), isNull(schema.ownerInvite.revokedAt)));
    await tx.insert(schema.ownerInvite).values({
      id,
      tokenHash: hashOwnerToken(token),
      email,
      organizationName,
      expiresAt,
    });
  });

  return { id, token, path: `/register?owner=${token}`, email, expiresAt };
}

async function findByToken(token: string): Promise<OwnerInviteRow | undefined> {
  const rows = await getDb()
    .select()
    .from(schema.ownerInvite)
    .where(eq(schema.ownerInvite.tokenHash, hashOwnerToken(token)))
    .limit(1);
  return rows[0];
}

/** Leitura para a tela (não consome). */
export async function checkOwnerInvite(
  token: string
): Promise<
  | { ok: true; email: string; organizationName: string | null; expiresAt: Date }
  | { ok: false; code: OwnerInviteFailure }
> {
  const row = await findByToken(token);
  const verdict = evaluateOwnerInvite(row, new Date());
  if (!verdict.ok) return verdict;
  if ((await organizationCount()) > 0) return { ok: false, code: "org_exists" };
  return {
    ok: true,
    email: row!.email,
    organizationName: row!.organizationName,
    expiresAt: row!.expiresAt,
  };
}

/**
 * Reserva o convite de forma atômica (UPDATE ... WHERE used_at IS NULL):
 * numa corrida, só uma requisição vence. Devolve a linha reservada.
 */
export async function claimOwnerInvite(token: string, email: string): Promise<OwnerInviteRow> {
  const row = await findByToken(token);
  const verdict = evaluateOwnerInvite(row, new Date());
  if (!verdict.ok) throw new OwnerInviteError(verdict.code, OWNER_INVITE_MESSAGE[verdict.code]);
  if (row!.email !== normalizeEmail(email)) {
    throw new OwnerInviteError("email_mismatch", OWNER_INVITE_MESSAGE.email_mismatch);
  }
  if ((await organizationCount()) > 0) {
    throw new OwnerInviteError("org_exists", OWNER_INVITE_MESSAGE.org_exists);
  }
  const claimed = await getDb()
    .update(schema.ownerInvite)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.ownerInvite.id, row!.id),
        isNull(schema.ownerInvite.usedAt),
        isNull(schema.ownerInvite.revokedAt),
        gt(schema.ownerInvite.expiresAt, new Date())
      )
    )
    .returning();
  if (!claimed[0]) throw new OwnerInviteError("used", OWNER_INVITE_MESSAGE.used);
  return claimed[0];
}

/** Desfaz a reserva quando a criação da conta falhou depois do claim. */
export async function releaseOwnerInvite(id: string): Promise<void> {
  await getDb()
    .update(schema.ownerInvite)
    .set({ usedAt: null })
    .where(eq(schema.ownerInvite.id, id));
}

/** Há convite de dono pendente (válido)? Fecha o cadastro público. */
export async function hasPendingOwnerInvite(now = new Date()): Promise<boolean> {
  const rows = await getDb()
    .select({ n: count() })
    .from(schema.ownerInvite)
    .where(
      and(
        isNull(schema.ownerInvite.usedAt),
        isNull(schema.ownerInvite.revokedAt),
        gt(schema.ownerInvite.expiresAt, now)
      )
    );
  return (rows[0]?.n ?? 0) > 0;
}
