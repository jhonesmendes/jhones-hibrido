import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export type DepartmentMetrics = {
  id: string | null;
  name: string;
  agentProfileName: string | null;
  memberCount: number;
  officialChannels: number;
  officialConnected: number;
  unofficialChannels: number;
  unofficialConnected: number;
  openConversations: number;
  handoffPending: number;
  unreadTotal: number;
};

export type DashboardAlert = {
  departmentName: string | null;
  type: "reconnect_required" | "handoff_backlog" | "no_agent_profile";
  message: string;
};

/** Fila de atendimento humano acima disto vira alerta (v0.1: fixo; não há
 * configuração de SLA no produto ainda). */
const HANDOFF_BACKLOG_THRESHOLD = 3;

/**
 * Dashboard consolidado (v0.1, Etapa 7) — visão de todos os departamentos
 * de uma vez, restrita a owner (os demais só veem o próprio escopo em
 * cada tela). Métricas de saúde operacional, não funil de vendas: canais
 * conectados, fila de atendimento humano, mensagens não lidas.
 */
/**
 * @param visibleDepartmentIds Escopo de quem está vendo: `null` = owner,
 * enxerga todos os departamentos + o bucket "Sem departamento" (recursos
 * ainda não vinculados a nenhum dept). Um array = admin (ou owner filtrando
 * por 1 dept específico) — só os departamentos listados entram, sem o
 * bucket "Sem departamento" (esse é território do owner, não de um dept
 * específico).
 */
export async function getDashboardData(
  organizationId: string,
  visibleDepartmentIds: string[] | null = null
): Promise<{
  departments: DepartmentMetrics[];
  alerts: DashboardAlert[];
}> {
  const db = getDb();

  const departmentRows = await db
    .select({
      id: schema.department.id,
      name: schema.department.name,
      agentProfileId: schema.department.agentProfileId,
    })
    .from(schema.department)
    .where(scoped(schema.department.organizationId, organizationId));

  const agentProfiles = await db
    .select({
      id: schema.agentProfile.id,
      name: schema.agentProfile.name,
      enabled: schema.agentProfile.enabled,
    })
    .from(schema.agentProfile)
    .where(scoped(schema.agentProfile.organizationId, organizationId));
  const agentProfileNameById = new Map(agentProfiles.map((p) => [p.id, p.name]));
  const hasAnyEnabledProfile = agentProfiles.some((p) => p.enabled);

  const memberCountRows = await db
    .select({
      departmentId: schema.memberDepartment.departmentId,
      n: sql<number>`count(*)`,
    })
    .from(schema.memberDepartment)
    .innerJoin(schema.member, eq(schema.memberDepartment.memberId, schema.member.id))
    .where(scoped(schema.member.organizationId, organizationId))
    .groupBy(schema.memberDepartment.departmentId);
  const memberCountByDept = new Map(memberCountRows.map((r) => [r.departmentId, Number(r.n)]));

  const officialRows = await db
    .select({
      departmentId: schema.metaCredentials.departmentId,
      status: schema.metaCredentials.status,
      isActive: schema.metaCredentials.isActive,
      displayPhoneNumber: schema.metaCredentials.displayPhoneNumber,
      phoneNumberId: schema.metaCredentials.phoneNumberId,
    })
    .from(schema.metaCredentials)
    .where(scoped(schema.metaCredentials.organizationId, organizationId));

  const unofficialRows = await db
    .select({
      departmentId: schema.unofficialChannel.departmentId,
      status: schema.unofficialChannel.status,
      isActive: schema.unofficialChannel.isActive,
    })
    .from(schema.unofficialChannel)
    .where(scoped(schema.unofficialChannel.organizationId, organizationId));

  const conversationRows = await db
    .select({
      departmentId: schema.conversation.departmentId,
      openCount: sql<number>`count(*) filter (where ${schema.conversation.handoffAt} is null)`,
      handoffCount: sql<number>`count(*) filter (where ${schema.conversation.handoffAt} is not null)`,
      unread: sql<number>`coalesce(sum(${schema.conversation.unreadCount}), 0)`,
    })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.isTest, false)
      )
    )
    .groupBy(schema.conversation.departmentId);
  const convByDept = new Map(
    conversationRows.map((r) => [
      r.departmentId,
      { open: Number(r.openCount), handoff: Number(r.handoffCount), unread: Number(r.unread) },
    ])
  );

  // Linhas do dashboard: 1 por departamento visível. Sem escopo (owner) =
  // todos + o bucket "Sem departamento" (canais/conversas ainda não
  // vinculados a nenhum dept — território do owner, não de um dept
  // específico). Com escopo (admin, ou owner filtrando por 1 dept) = só os
  // departamentos listados, sem o bucket.
  const scopedDepartmentRows =
    visibleDepartmentIds === null
      ? departmentRows
      : departmentRows.filter((d) => visibleDepartmentIds.includes(d.id));
  const rows: { id: string | null; name: string; agentProfileId: string | null }[] =
    scopedDepartmentRows.map((d) => ({
      id: d.id,
      name: d.name,
      agentProfileId: d.agentProfileId,
    }));
  if (visibleDepartmentIds === null) {
    rows.push({
      id: null,
      name: departmentRows.length > 0 ? "Sem departamento" : "Organização inteira",
      agentProfileId: null,
    });
  }

  const departments: DepartmentMetrics[] = rows.map((row) => {
    const official = officialRows.filter((r) => r.departmentId === row.id);
    const unofficial = unofficialRows.filter((r) => r.departmentId === row.id);
    const conv = convByDept.get(row.id) ?? { open: 0, handoff: 0, unread: 0 };
    return {
      id: row.id,
      name: row.name,
      agentProfileName: row.agentProfileId
        ? agentProfileNameById.get(row.agentProfileId) ?? null
        : null,
      memberCount: row.id ? memberCountByDept.get(row.id) ?? 0 : 0,
      officialChannels: official.length,
      officialConnected: official.filter((r) => r.status === "connected" && r.isActive).length,
      unofficialChannels: unofficial.length,
      unofficialConnected: unofficial.filter((r) => r.status === "connected" && r.isActive)
        .length,
      openConversations: conv.open,
      handoffPending: conv.handoff,
      unreadTotal: conv.unread,
    };
  });

  const deptNameById = new Map(rows.map((r) => [r.id, r.name]));

  const alerts: DashboardAlert[] = [];
  for (const r of officialRows) {
    if (r.status !== "reconnect_required") continue;
    // Fora do escopo de quem está vendo (admin restrito a seus depts): nem
    // o alerta aparece — sem isso vazaria a existência de um canal de outro
    // departamento com o rótulo errado de "Sem departamento".
    if (!deptNameById.has(r.departmentId)) continue;
    alerts.push({
      departmentName: deptNameById.get(r.departmentId) ?? "Sem departamento",
      type: "reconnect_required",
      message: `Número ${r.displayPhoneNumber ?? r.phoneNumberId} com o token vencido — reconecte em Configurações → Canais`,
    });
  }
  for (const d of departments) {
    if (d.handoffPending > HANDOFF_BACKLOG_THRESHOLD) {
      alerts.push({
        departmentName: d.id ? d.name : null,
        type: "handoff_backlog",
        message: `${d.handoffPending} conversas aguardando atendimento humano`,
      });
    }
  }
  if (!hasAnyEnabledProfile) {
    alerts.push({
      departmentName: null,
      type: "no_agent_profile",
      message: "Nenhum perfil de IA ativo na organização — configure em Agente",
    });
  }

  return { departments, alerts };
}
