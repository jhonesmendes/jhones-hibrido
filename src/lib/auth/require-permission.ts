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

/**
 * Permissões efetivas de um membro: default do papel + overrides do banco.
 * Owner também pode ter overrides (ex.: abrir mão de "ver todas as
 * conversas") — não há bypass aqui; quem sempre passa é `requirePermission`
 * para as ações estruturais que exigem o papel em si (gestão de equipe etc.).
 */
export async function resolvePermissions(
  memberId: string,
  role: string
): Promise<Set<Permission>> {
  const effective = roleDefaults(role);
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

/** Role do membro dentro de um departamento; null = não pertence a ele. */
export async function departmentRole(
  memberId: string,
  departmentId: string
): Promise<"admin" | "agent" | null> {
  const db = getDb();
  const [row] = await db
    .select({ role: schema.memberDepartment.role })
    .from(schema.memberDepartment)
    .where(
      and(
        eq(schema.memberDepartment.memberId, memberId),
        eq(schema.memberDepartment.departmentId, departmentId)
      )
    )
    .limit(1);
  return row?.role ?? null;
}

/**
 * Permissão dentro de um departamento (v0.1, Fundação de departamentos):
 * 1. owner da org → sempre true
 * 2. admin do dept → true para qualquer permissão do dept
 * 3. agent do dept → só o que foi concedido em `member_department_permission`
 * 4. não pertence ao dept → false
 */
export async function hasPermissionInDept(
  session: SessionContext,
  departmentId: string,
  permission: Permission
): Promise<boolean> {
  if (session.role === "owner") return true;
  const role = await departmentRole(session.memberId, departmentId);
  if (!role) return false;
  if (role === "admin") return true;
  const db = getDb();
  const [row] = await db
    .select({ granted: schema.memberDepartmentPermission.granted })
    .from(schema.memberDepartmentPermission)
    .where(
      and(
        eq(schema.memberDepartmentPermission.memberId, session.memberId),
        eq(schema.memberDepartmentPermission.departmentId, departmentId),
        eq(schema.memberDepartmentPermission.permission, permission)
      )
    )
    .limit(1);
  return row?.granted ?? false;
}

/**
 * Sem `conversations:view_all`, só é permitido acessar a conversa atribuída
 * ao próprio membro (FR-007) — inclusive owner, se abriu mão dessa
 * permissão para si (é uma escolha, não uma trava). v0.1: quando a conversa
 * pertence a um departamento e quem pede NÃO é owner, pertencer a esse
 * departamento já basta — vê qualquer conversa do número do seu depto,
 * atribuída ou não (o objetivo do depto é justamente isso: agrupar quem
 * atende aquele número). Owner não ganha esse atalho (ele "pertence" a
 * todos os deptos por definição): segue direto para a checagem de
 * atribuição/view_all abaixo, que ele pode restringir para si mesmo.
 */
export async function requireConversationAccess(
  session: SessionContext,
  conversation: { assignedTo: string | null; departmentId?: string | null }
): Promise<void> {
  if (conversation.departmentId && session.role !== "owner") {
    const role = await departmentRole(session.memberId, conversation.departmentId);
    if (!role) {
      throw new ForbiddenError("Conversa de outro departamento");
    }
    return;
  }
  const effective = await resolvePermissions(session.memberId, session.role);
  if (effective.has("conversations:view_all")) return;
  if (conversation.assignedTo === session.memberId) return;
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
