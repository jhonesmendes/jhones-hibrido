import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import {
  DEFAULT_PERMISSIONS,
  type Permission,
  PERMISSIONS,
  type Role,
} from "@/lib/auth/permissions";

export class ForbiddenError extends Error {
  constructor(message = "Permissão insuficiente") {
    super(message);
    this.name = "ForbiddenError";
  }
}

function roleDefaults(role: string): Set<Permission> {
  return new Set(DEFAULT_PERMISSIONS[role as Role] ?? DEFAULT_PERMISSIONS.agent);
}

/** Permissões efetivas de um membro: default do papel + overrides do banco. */
export async function resolvePermissions(
  memberId: string,
  role: string
): Promise<Set<Permission>> {
  const effective = roleDefaults(role);
  if (role === "owner") return effective;
  const db = getDb();
  const overrides = await db
    .select({
      permission: schema.memberPermission.permission,
      granted: schema.memberPermission.granted,
    })
    .from(schema.memberPermission)
    .where(eq(schema.memberPermission.memberId, memberId));
  for (const o of overrides) {
    if (o.granted) effective.add(o.permission as Permission);
    else effective.delete(o.permission as Permission);
  }
  return effective;
}

/** Lança ForbiddenError se o membro da sessão não tiver a permissão. Owner sempre passa. */
export async function requirePermission(
  session: SessionContext,
  permission: Permission
): Promise<void> {
  if (session.role === "owner") return;
  const effective = await resolvePermissions(session.memberId, session.role);
  if (!effective.has(permission)) {
    throw new ForbiddenError(
      `Permissão necessária: ${PERMISSIONS[permission]}`
    );
  }
}

/**
 * Sem `conversations:view_all`, só é permitido acessar a conversa atribuída
 * ao próprio membro (FR-007).
 */
export async function requireConversationAccess(
  session: SessionContext,
  assignedTo: string | null
): Promise<void> {
  if (session.role === "owner") return;
  const effective = await resolvePermissions(session.memberId, session.role);
  if (effective.has("conversations:view_all")) return;
  if (assignedTo === session.memberId) return;
  throw new ForbiddenError("Conversa não atribuída a você");
}

export type ChannelType = "official" | "unofficial";
export type ChannelAccess = { canView: boolean; canSend: boolean };

/** Acesso a canal de um membro. Ausência de linha = liberado por padrão. */
export async function resolveChannelAccess(
  memberId: string,
  role: string,
  channelType: ChannelType
): Promise<ChannelAccess> {
  if (role === "owner") return { canView: true, canSend: true };
  const db = getDb();
  const [row] = await db
    .select({
      canView: schema.memberChannel.canView,
      canSend: schema.memberChannel.canSend,
    })
    .from(schema.memberChannel)
    .where(
      and(
        eq(schema.memberChannel.memberId, memberId),
        eq(schema.memberChannel.channelType, channelType)
      )
    )
    .limit(1);
  return row ?? { canView: true, canSend: true };
}

/** Lança ForbiddenError se o membro da sessão não puder ver/enviar pelo canal. */
export async function requireChannelAccess(
  session: SessionContext,
  channelType: ChannelType,
  mode: "view" | "send"
): Promise<void> {
  if (session.role === "owner") return;
  const access = await resolveChannelAccess(
    session.memberId,
    session.role,
    channelType
  );
  const allowed = mode === "view" ? access.canView : access.canSend;
  if (!allowed) {
    throw new ForbiddenError(
      `Acesso negado ao canal ${channelType === "official" ? "oficial" : "não oficial"}`
    );
  }
}
