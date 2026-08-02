import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export type AgentProfileRow = typeof schema.agentProfile.$inferSelect;

/**
 * Resolve o perfil de agente IA de uma conversa (v0.1, Fundação de IA por
 * departamento/perfil) — cadeia de prioridade:
 *
 *   1. `conversation.agentProfileId`  — override manual (maior prioridade)
 *   2. `member.agentProfileId`        — padrão do atendente (`conversation.assignedTo`)
 *   3. `department.agentProfileId`    — padrão do departamento da conversa
 *   4. perfil mais antigo ativo da organização — fallback (comportamento
 *      pré-multi-perfil: continua funcionando sem nenhuma atribuição feita)
 *
 * `includeDisabled` existe só para o Laboratório: ele avalia o comportamento
 * configurado mesmo que o perfil ainda não esteja "ativo" para conversas
 * reais (mesma exceção que já existia antes da v0.1).
 */
export async function resolveAgentProfile(
  organizationId: string,
  conversation: {
    agentProfileId: string | null;
    assignedTo: string | null;
    departmentId: string | null;
  },
  opts: { includeDisabled?: boolean } = {}
): Promise<AgentProfileRow | null> {
  const db = getDb();
  const enabledCondition = opts.includeDisabled
    ? undefined
    : eq(schema.agentProfile.enabled, true);

  async function byId(id: string): Promise<AgentProfileRow | null> {
    const rows = await db
      .select()
      .from(schema.agentProfile)
      .where(
        and(
          eq(schema.agentProfile.id, id),
          scoped(schema.agentProfile.organizationId, organizationId),
          enabledCondition
        )
      )
      .limit(1);
    return rows[0] ?? null;
  }

  if (conversation.agentProfileId) {
    const byOverride = await byId(conversation.agentProfileId);
    if (byOverride) return byOverride;
  }

  if (conversation.assignedTo) {
    const memberRows = await db
      .select({ agentProfileId: schema.member.agentProfileId })
      .from(schema.member)
      .where(eq(schema.member.id, conversation.assignedTo))
      .limit(1);
    const memberProfileId = memberRows[0]?.agentProfileId;
    if (memberProfileId) {
      const byMember = await byId(memberProfileId);
      if (byMember) return byMember;
    }
  }

  if (conversation.departmentId) {
    const deptRows = await db
      .select({ agentProfileId: schema.department.agentProfileId })
      .from(schema.department)
      .where(eq(schema.department.id, conversation.departmentId))
      .limit(1);
    const deptProfileId = deptRows[0]?.agentProfileId;
    if (deptProfileId) {
      const byDept = await byId(deptProfileId);
      if (byDept) return byDept;
    }
  }

  const fallbackRows = await db
    .select()
    .from(schema.agentProfile)
    .where(
      and(scoped(schema.agentProfile.organizationId, organizationId), enabledCondition)
    )
    .orderBy(asc(schema.agentProfile.createdAt))
    .limit(1);
  return fallbackRows[0] ?? null;
}
