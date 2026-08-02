import { and, count, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { DEFAULT_PERMISSIONS, isPermission, type Role } from "@/lib/auth/permissions";

export class MemberUpdateError extends Error {
  code: "not_found" | "forbidden" | "last_owner";
  constructor(code: "not_found" | "forbidden" | "last_owner", message: string) {
    super(message);
    this.name = "MemberUpdateError";
    this.code = code;
  }
}

export function memberUpdateErrorStatus(err: MemberUpdateError): number {
  return { not_found: 404, forbidden: 403, last_owner: 409 }[err.code];
}

export type ChannelAccessPatch = { canView: boolean; canSend: boolean };

export type MemberPatch = {
  role?: Role;
  isActive?: boolean;
  permissions?: Record<string, boolean>;
  channels?: {
    official?: ChannelAccessPatch;
    unofficial?: ChannelAccessPatch;
  };
  /** Perfil de agente IA padrão deste atendente (v0.1, Etapa 6). */
  agentProfileId?: string | null;
};

/**
 * Aplica uma edição administrativa de membro (US2): papel, status,
 * permissões e canais. Bloqueia ficar sem nenhum owner ativo (FR-002) e
 * exige owner para mexer em outro owner (T030).
 */
export async function updateMember(
  organizationId: string,
  memberId: string,
  actorRole: string,
  patch: MemberPatch
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ role: schema.member.role, isActive: schema.member.isActive })
    .from(schema.member)
    .where(
      scoped(schema.member.organizationId, organizationId, eq(schema.member.id, memberId))
    )
    .limit(1);
  const target = rows[0];
  if (!target) throw new MemberUpdateError("not_found", "Membro não encontrado");

  if (
    actorRole !== "owner" &&
    (target.role === "owner" || patch.role === "owner")
  ) {
    throw new MemberUpdateError(
      "forbidden",
      "Só o proprietário gerencia outros proprietários"
    );
  }

  const nextRole = patch.role ?? target.role;
  const nextActive = patch.isActive ?? target.isActive;
  const losesOwner =
    target.role === "owner" && (nextRole !== "owner" || !nextActive);
  if (losesOwner) {
    const [remaining] = await db
      .select({ n: count() })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.organizationId, organizationId),
          eq(schema.member.role, "owner"),
          eq(schema.member.isActive, true),
          ne(schema.member.id, memberId)
        )
      );
    if ((remaining?.n ?? 0) === 0) {
      throw new MemberUpdateError(
        "last_owner",
        "A organização precisa de ao menos um proprietário ativo"
      );
    }
  }

  await db.transaction(async (tx) => {
    if (
      patch.role !== undefined ||
      patch.isActive !== undefined ||
      patch.agentProfileId !== undefined
    ) {
      await tx
        .update(schema.member)
        .set({
          ...(patch.role !== undefined ? { role: patch.role } : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
          ...(patch.agentProfileId !== undefined
            ? { agentProfileId: patch.agentProfileId }
            : {}),
        })
        .where(eq(schema.member.id, memberId));
    }

    if (patch.permissions) {
      const roleForDefaults = (patch.role ?? target.role) as Role;
      const defaults = new Set(
        DEFAULT_PERMISSIONS[roleForDefaults] ?? DEFAULT_PERMISSIONS.agent
      );
      for (const [key, desired] of Object.entries(patch.permissions)) {
        if (!isPermission(key)) continue;
        const isDefault = defaults.has(key);
        if (desired === isDefault) {
          await tx
            .delete(schema.memberPermission)
            .where(
              and(
                eq(schema.memberPermission.memberId, memberId),
                eq(schema.memberPermission.permission, key)
              )
            );
        } else {
          await tx
            .insert(schema.memberPermission)
            .values({
              id: newId("memberPermission"),
              memberId,
              permission: key,
              granted: desired,
            })
            .onConflictDoUpdate({
              target: [schema.memberPermission.memberId, schema.memberPermission.permission],
              set: { granted: desired },
            });
        }
      }
    }

    if (patch.channels) {
      for (const channelType of ["official", "unofficial"] as const) {
        const desired = patch.channels[channelType];
        if (!desired) continue;
        if (desired.canView && desired.canSend) {
          await tx
            .delete(schema.memberChannel)
            .where(
              and(
                eq(schema.memberChannel.memberId, memberId),
                eq(schema.memberChannel.channelType, channelType)
              )
            );
        } else {
          await tx
            .insert(schema.memberChannel)
            .values({
              id: newId("memberChannel"),
              memberId,
              channelType,
              canView: desired.canView,
              canSend: desired.canSend,
            })
            .onConflictDoUpdate({
              target: [schema.memberChannel.memberId, schema.memberChannel.channelType],
              set: { canView: desired.canView, canSend: desired.canSend },
            });
        }
      }
    }
  });
}
