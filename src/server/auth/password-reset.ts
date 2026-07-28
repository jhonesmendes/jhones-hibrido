import { randomBytes, createHash } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { sendMail, SmtpNotConfiguredError, SmtpSendError } from "@/lib/mail/smtp";
import { getEnv } from "@/lib/env";

const RESET_TTL_MS = 60 * 60 * 1000; // 1h (FR-017)

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Solicita redefinição de senha (FR-016/FR-017/FR-018). Nunca revela se o
 * e-mail existe — sempre "funciona" do ponto de vista do chamador. Cria o
 * token independentemente do SMTP estar configurado: sua mera existência
 * (não usado, não expirado) É o "pedido pendente" que o owner vê no painel
 * quando o envio automático não é possível.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({
      memberId: schema.member.id,
      organizationId: schema.member.organizationId,
      isActive: schema.member.isActive,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(eq(schema.user.email, email))
    .limit(1);
  const member = rows[0];
  if (!member || !member.isActive) return;

  const token = generateToken();
  await db.insert(schema.passwordResetToken).values({
    id: newId("passwordResetToken"),
    memberId: member.memberId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });

  const url = `${getEnv().APP_BASE_URL}/reset-password?token=${token}`;
  try {
    await sendMail(member.organizationId, {
      to: email,
      subject: "Redefinição de senha — Vocero",
      text: `Para redefinir sua senha, acesse: ${url}\n\nEste link expira em 1 hora. Se você não pediu isso, ignore este e-mail.`,
    });
  } catch (err) {
    if (err instanceof SmtpNotConfiguredError || err instanceof SmtpSendError) {
      // Degradação esperada (FR-018): o token já existe no banco, o owner
      // vê a solicitação pendente e gera um link manualmente.
      return;
    }
    throw err;
  }
}

export class PasswordResetError extends Error {
  code: "invalid" | "expired" | "used";
  constructor(code: "invalid" | "expired" | "used", message: string) {
    super(message);
    this.name = "PasswordResetError";
    this.code = code;
  }
}

/** Consome o token e troca a senha (FR-017). Uso único, atômico. */
export async function consumePasswordReset(
  tokenPlain: string,
  newPassword: string
): Promise<void> {
  const db = getDb();
  const tokenHash = hashToken(tokenPlain);
  const rows = await db
    .select()
    .from(schema.passwordResetToken)
    .where(eq(schema.passwordResetToken.tokenHash, tokenHash))
    .limit(1);
  const record = rows[0];
  if (!record) throw new PasswordResetError("invalid", "Link inválido");
  if (record.usedAt) throw new PasswordResetError("used", "Link já utilizado");
  if (record.expiresAt.getTime() < Date.now()) {
    throw new PasswordResetError("expired", "Link expirado");
  }

  const claimed = await db
    .update(schema.passwordResetToken)
    .set({ usedAt: new Date() })
    .where(
      and(eq(schema.passwordResetToken.id, record.id), isNull(schema.passwordResetToken.usedAt))
    )
    .returning({ id: schema.passwordResetToken.id });
  if (claimed.length === 0) throw new PasswordResetError("used", "Link já utilizado");

  const memberRows = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .where(eq(schema.member.id, record.memberId))
    .limit(1);
  const userId = memberRows[0]?.userId;
  if (!userId) throw new PasswordResetError("invalid", "Conta não encontrada");

  const hashed = await hashPassword(newPassword);
  await db
    .update(schema.account)
    .set({ password: hashed })
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")));
}

export type PendingReset = {
  memberId: string;
  name: string;
  email: string;
  requestedAt: string;
};

/** Solicitações pendentes (token não usado e não expirado) — painel do owner. */
export async function listPendingResets(organizationId: string): Promise<PendingReset[]> {
  const db = getDb();
  const rows = await db
    .select({
      memberId: schema.member.id,
      name: schema.user.name,
      email: schema.user.email,
      requestedAt: schema.passwordResetToken.createdAt,
    })
    .from(schema.passwordResetToken)
    .innerJoin(schema.member, eq(schema.passwordResetToken.memberId, schema.member.id))
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        isNull(schema.passwordResetToken.usedAt),
        gt(schema.passwordResetToken.expiresAt, new Date())
      )
    )
    .orderBy(schema.passwordResetToken.createdAt);
  return rows.map((r) => ({ ...r, requestedAt: r.requestedAt.toISOString() }));
}

/**
 * Gera um novo link manual para o owner compartilhar (o token original
 * nunca fica recuperável — só o hash é persistido). Invalida qualquer
 * pendência anterior do mesmo membro antes de criar a nova.
 */
export async function generateManualResetLink(
  organizationId: string,
  memberId: string
): Promise<string> {
  const db = getDb();
  const member = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.id, memberId)))
    .limit(1);
  if (!member[0]) throw new PasswordResetError("invalid", "Membro não encontrado");

  await db
    .update(schema.passwordResetToken)
    .set({ usedAt: new Date() })
    .where(
      and(eq(schema.passwordResetToken.memberId, memberId), isNull(schema.passwordResetToken.usedAt))
    );

  const token = generateToken();
  await db.insert(schema.passwordResetToken).values({
    id: newId("passwordResetToken"),
    memberId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });

  return `${getEnv().APP_BASE_URL}/reset-password?token=${token}`;
}
