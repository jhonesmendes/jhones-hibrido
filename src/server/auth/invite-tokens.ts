import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { isPermission, type Role } from "@/lib/auth/permissions";
import type { ChannelType } from "@/lib/auth/require-permission";

export type InviteChannels = Partial<
  Record<ChannelType, { canView: boolean; canSend: boolean }>
>;

const EXPIRES_IN_MS: Record<"24h" | "7d" | "30d", number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInviteToken(params: {
  organizationId: string;
  role: "admin" | "agent";
  email?: string;
  permissions?: Record<string, boolean>;
  channels?: InviteChannels;
  /** Departamento (v0.1) ao qual o convidado já entra vinculado. */
  departmentId?: string;
  departmentRole?: "admin" | "agent";
  expiresIn: "24h" | "7d" | "30d";
  createdBy: string;
}): Promise<{ id: string; url: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + EXPIRES_IN_MS[params.expiresIn]);
  const db = getDb();
  const id = newId("inviteToken");
  await db.insert(schema.inviteToken).values({
    id,
    organizationId: params.organizationId,
    tokenHash: hashToken(token),
    email: params.email ?? null,
    role: params.role,
    initialPermissions: params.permissions ?? null,
    initialChannels: params.channels ?? null,
    initialDepartmentId: params.departmentId ?? null,
    initialDepartmentRole: params.departmentId ? params.departmentRole ?? "agent" : null,
    expiresAt,
    createdBy: params.createdBy,
  });
  return { id, url: `/register?token=${token}`, expiresAt };
}

export type InviteCheckResult =
  | {
      ok: true;
      email: string | null;
      role: Role;
      expiresAt: Date;
      inviterName: string | null;
      permissions: string[];
      departmentName: string | null;
    }
  | { ok: false; code: "invalid" | "expired" | "used" };

/** Checagem de leitura (UX do formulário) — não consome o token. */
export async function checkInviteToken(
  tokenPlain: string
): Promise<InviteCheckResult> {
  const db = getDb();
  const rows = await db
    .select({
      invite: schema.inviteToken,
      inviterName: schema.user.name,
      departmentName: schema.department.name,
    })
    .from(schema.inviteToken)
    .innerJoin(schema.member, eq(schema.inviteToken.createdBy, schema.member.id))
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .leftJoin(
      schema.department,
      eq(schema.inviteToken.initialDepartmentId, schema.department.id)
    )
    .where(eq(schema.inviteToken.tokenHash, hashToken(tokenPlain)))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, code: "invalid" };
  const invite = row.invite;
  if (invite.usedAt) return { ok: false, code: "used" };
  if (invite.expiresAt.getTime() < Date.now()) return { ok: false, code: "expired" };

  const initialPermissions = invite.initialPermissions as Record<string, boolean> | null;
  const permissions = initialPermissions
    ? Object.entries(initialPermissions)
        .filter(([, granted]) => granted)
        .map(([key]) => key)
    : [];

  return {
    ok: true,
    email: invite.email,
    role: invite.role as Role,
    expiresAt: invite.expiresAt,
    inviterName: row.inviterName,
    permissions,
    departmentName: row.departmentName,
  };
}

export class InviteConsumeError extends Error {
  code: "invalid" | "expired" | "used" | "email_mismatch";
  constructor(code: "invalid" | "expired" | "used" | "email_mismatch", message: string) {
    super(message);
    this.name = "InviteConsumeError";
    this.code = code;
  }
}

/**
 * Consome o convite e cria a membership atomicamente (FR-012): o `UPDATE
 * ... WHERE used_at IS NULL` dentro da mesma transação do insert de member
 * garante que, numa corrida, só um dos dois usos vence — o outro lança
 * InviteConsumeError("used") e desfaz seu próprio insert (rollback).
 */
export async function consumeInviteToken(
  tokenPlain: string,
  userId: string,
  emailUsed: string
): Promise<{ memberId: string; organizationId: string }> {
  const db = getDb();
  const tokenHash = hashToken(tokenPlain);

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.inviteToken)
      .where(eq(schema.inviteToken.tokenHash, tokenHash))
      .limit(1);
    const invite = rows[0];
    if (!invite) throw new InviteConsumeError("invalid", "Convite inválido");
    if (invite.usedAt) throw new InviteConsumeError("used", "Convite já utilizado");
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new InviteConsumeError("expired", "Convite expirado");
    }
    if (invite.email && invite.email !== emailUsed) {
      throw new InviteConsumeError(
        "email_mismatch",
        "Este convite é restrito a outro e-mail"
      );
    }

    // Se o usuário já tem membership nesta org (ex.: convite repetido, ou
    // reconvite de alguém que já foi removido), reusa a linha em vez de
    // inserir outra — member_org_user_uq bloquearia o insert de qualquer
    // forma, mas checar antes evita depender do erro de constraint e
    // permite reativar quem estava desativado.
    const existingMember = await tx
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.organizationId, invite.organizationId),
          eq(schema.member.userId, userId)
        )
      )
      .limit(1);
    const memberId = existingMember[0]?.id ?? newId("organization");
    if (existingMember[0]) {
      await tx
        .update(schema.member)
        .set({ role: invite.role, isActive: true })
        .where(eq(schema.member.id, memberId));
    } else {
      await tx.insert(schema.member).values({
        id: memberId,
        organizationId: invite.organizationId,
        userId,
        role: invite.role,
      });
    }

    const claimed = await tx
      .update(schema.inviteToken)
      .set({ usedAt: new Date(), usedBy: memberId })
      .where(and(eq(schema.inviteToken.id, invite.id), isNull(schema.inviteToken.usedAt)))
      .returning({ id: schema.inviteToken.id });
    if (claimed.length === 0) {
      throw new InviteConsumeError("used", "Convite já utilizado");
    }

    const permissions = invite.initialPermissions as Record<string, boolean> | null;
    if (permissions) {
      for (const [key, granted] of Object.entries(permissions)) {
        if (!isPermission(key)) continue;
        await tx.insert(schema.memberPermission).values({
          id: newId("memberPermission"),
          memberId,
          permission: key,
          granted,
        });
      }
    }

    const channels = invite.initialChannels as InviteChannels | null;
    if (channels) {
      for (const channelType of ["official", "unofficial"] as const) {
        const access = channels[channelType];
        if (!access) continue;
        await tx.insert(schema.memberChannel).values({
          id: newId("memberChannel"),
          memberId,
          channelType,
          canView: access.canView,
          canSend: access.canSend,
        });
      }
    }

    if (invite.initialDepartmentId) {
      await tx.insert(schema.memberDepartment).values({
        id: newId("memberDepartment"),
        memberId,
        departmentId: invite.initialDepartmentId,
        role: invite.initialDepartmentRole ?? "agent",
      });
    }

    return { memberId, organizationId: invite.organizationId };
  });
}
