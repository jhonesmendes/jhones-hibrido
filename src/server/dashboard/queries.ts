import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
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

export type DashboardPeriod = "today" | "7d" | "30d";

function periodStart(period: DashboardPeriod): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === "7d") d.setDate(d.getDate() - 6);
  if (period === "30d") d.setDate(d.getDate() - 29);
  return d;
}

export type DashboardExtras = {
  summary: {
    openConversations: number;
    agentsOnline: number;
    agentsTotal: number;
    queueWaiting: number;
    queueLongestWaitMin: number | null;
    windowExpired: number;
  };
  volumeByDay: {
    date: string;
    count: number;
    byDepartment: { departmentId: string | null; departmentName: string; count: number }[];
  }[];
  agents: {
    id: string;
    name: string;
    status: string;
    messagesSentToday: number;
    contactsToday: number;
  }[];
  lab: { score: number | null; delta: number | null; handoffsToday: number };
  pipeline: { stageId: string; name: string; kind: string; count: number }[];
  channels: {
    official: { connected: number; total: number; messages: number };
    unofficial: { connected: number; total: number; messages: number };
  };
};

/**
 * Segunda leva de métricas do dashboard (v0.2) — tudo aqui é computado a
 * partir de dados que já existem (sem coluna/tabela nova). Deliberadamente
 * NÃO inclui "tempo médio de resposta" nem "% resolvida pela IA": nada
 * registra isso hoje, e a definição de "resolvida" ainda depende de uma
 * decisão de produto (config por departamento/modelo — ver conversa com o
 * dono). Fica pra uma fase 2.
 */
export async function getDashboardExtras(
  organizationId: string,
  visibleDepartmentIds: string[] | null,
  period: DashboardPeriod
): Promise<DashboardExtras> {
  const db = getDb();
  const deptScope =
    visibleDepartmentIds !== null
      ? inArray(schema.conversation.departmentId, visibleDepartmentIds)
      : undefined;
  const windowThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since = periodStart(period);
  const volumeSince = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 6);
    return d;
  })();

  // Resumo: conversas abertas, janela de 24h expirada — agregado direto,
  // sem iterar conversa por conversa (isWindowOpen vira um predicado SQL).
  const [summaryRow] = await db
    .select({
      open: sql<number>`count(*) filter (where ${schema.conversation.handoffAt} is null)`,
      windowExpired: sql<number>`count(*) filter (
        where ${schema.conversation.handoffAt} is null
          and ${schema.conversation.lastInboundAt} is not null
          and ${schema.conversation.lastInboundAt} < ${windowThreshold.toISOString()}
      )`,
    })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        deptScope
          ? and(eq(schema.conversation.isTest, false), deptScope)
          : eq(schema.conversation.isTest, false)
      )
    );

  // Fila agora: quantos esperando + espera mais longa (minutos).
  const queueScope =
    visibleDepartmentIds !== null
      ? inArray(schema.conversationQueue.departmentId, visibleDepartmentIds)
      : undefined;
  const [queueRow] = await db
    .select({
      waiting: sql<number>`count(*)`,
      oldestMin: sql<number | null>`extract(epoch from (now() - min(${schema.conversationQueue.createdAt}))) / 60`,
    })
    .from(schema.conversationQueue)
    .where(
      queueScope
        ? and(eq(schema.conversationQueue.status, "waiting"), queueScope)
        : eq(schema.conversationQueue.status, "waiting")
    );

  // Atendentes: status ao vivo (agent_status) + quantas conversas abertas
  // cada um tem atribuída agora. Escopo por departamento = só membros
  // daqueles departamentos (admin); sem escopo (owner) = toda a equipe.
  const memberScopeRows =
    visibleDepartmentIds !== null
      ? await db
          .selectDistinct({ memberId: schema.memberDepartment.memberId })
          .from(schema.memberDepartment)
          .where(inArray(schema.memberDepartment.departmentId, visibleDepartmentIds))
      : null;
  const memberIdScope = memberScopeRows?.map((r) => r.memberId) ?? null;

  const memberRows = await db
    .select({
      id: schema.member.id,
      name: schema.user.name,
      status: schema.agentStatus.status,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .leftJoin(schema.agentStatus, eq(schema.agentStatus.memberId, schema.member.id))
    .where(
      and(
        scoped(schema.member.organizationId, organizationId),
        eq(schema.member.isActive, true),
        memberIdScope ? inArray(schema.member.id, memberIdScope) : undefined
      )
    );

  // Mensagens enviadas HOJE por cada atendente (não "total de conversas
  // atribuídas" — esse número só crescia e não dizia nada sobre o dia) +
  // quantos CONTATOS distintos cada um atendeu hoje (contagem por contato,
  // não por mensagem — um contato que recebeu 10 mensagens conta 1, não 10).
  const sentTodayStart = periodStart("today");
  const sentTodayRows = await db
    .select({
      sentByMemberId: schema.message.sentByMemberId,
      n: sql<number>`count(*)`,
      contacts: sql<number>`count(distinct ${schema.conversation.contactId})`,
    })
    .from(schema.message)
    .innerJoin(schema.conversation, eq(schema.message.conversationId, schema.conversation.id))
    .where(
      and(
        eq(schema.message.organizationId, organizationId),
        eq(schema.conversation.isTest, false),
        eq(schema.message.direction, "out"),
        gte(schema.message.createdAt, sentTodayStart)
      )
    )
    .groupBy(schema.message.sentByMemberId);
  const sentTodayByMember = new Map<string, number>();
  const contactsTodayByMember = new Map<string, number>();
  for (const r of sentTodayRows) {
    if (r.sentByMemberId) {
      sentTodayByMember.set(r.sentByMemberId, Number(r.n));
      contactsTodayByMember.set(r.sentByMemberId, Number(r.contacts));
    }
  }

  const agents = memberRows.map((m) => ({
    id: m.id,
    name: m.name,
    status: m.status ?? "offline",
    messagesSentToday: sentTodayByMember.get(m.id) ?? 0,
    contactsToday: contactsTodayByMember.get(m.id) ?? 0,
  }));

  // Volume de mensagens por dia — últimos 7 dias corridos, sempre (o
  // gráfico não muda com o filtro Hoje/7d/30d, só os números de canal abaixo).
  // Quebrado por departamento pra mostrar de onde vem o volume no dia.
  const volumeRows = await db
    .select({
      day: sql<string>`to_char(${schema.message.createdAt}, 'YYYY-MM-DD')`,
      departmentId: schema.conversation.departmentId,
      n: sql<number>`count(*)`,
    })
    .from(schema.message)
    .innerJoin(schema.conversation, eq(schema.message.conversationId, schema.conversation.id))
    .where(
      and(
        eq(schema.message.organizationId, organizationId),
        eq(schema.conversation.isTest, false),
        gte(schema.message.createdAt, volumeSince),
        deptScope
      )
    )
    .groupBy(sql`to_char(${schema.message.createdAt}, 'YYYY-MM-DD')`, schema.conversation.departmentId);

  const volumeDeptRows = await db
    .select({ id: schema.department.id, name: schema.department.name })
    .from(schema.department)
    .where(
      visibleDepartmentIds !== null
        ? and(scoped(schema.department.organizationId, organizationId), inArray(schema.department.id, visibleDepartmentIds))
        : scoped(schema.department.organizationId, organizationId)
    );
  const volumeDeptNameById = new Map<string | null, string>(volumeDeptRows.map((d) => [d.id, d.name]));
  volumeDeptNameById.set(null, "Sem departamento");

  const volumeByDay: {
    date: string;
    count: number;
    byDepartment: { departmentId: string | null; departmentName: string; count: number }[];
  }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayRows = volumeRows.filter((r) => r.day === key);
    const byDepartment = dayRows
      .map((r) => ({
        departmentId: r.departmentId,
        departmentName: volumeDeptNameById.get(r.departmentId) ?? "Sem departamento",
        count: Number(r.n),
      }))
      .sort((a, b) => b.count - a.count);
    volumeByDay.push({
      date: key,
      count: byDepartment.reduce((sum, r) => sum + r.count, 0),
      byDepartment,
    });
  }

  // Laboratório: score + delta da última execução concluída, handoffs de hoje.
  const runs = await db
    .select({ score: schema.agentTestRun.score, status: schema.agentTestRun.status })
    .from(schema.agentTestRun)
    .where(
      scoped(
        schema.agentTestRun.organizationId,
        organizationId,
        eq(schema.agentTestRun.status, "done")
      )
    )
    .orderBy(desc(schema.agentTestRun.startedAt))
    .limit(2);
  const latestScore = runs[0]?.score ?? null;
  const prevScore = runs[1]?.score ?? null;
  const todayStart = periodStart("today");
  const [handoffRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        and(
          gte(schema.conversation.handoffAt, todayStart),
          deptScope
        )
      )
    );

  // Pipeline: contagem de leads por etapa (sempre org inteira — leads não
  // têm departamento no schema).
  const stages = await db
    .select({ id: schema.pipelineStage.id, name: schema.pipelineStage.name, kind: schema.pipelineStage.kind })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, organizationId))
    .orderBy(asc(schema.pipelineStage.position));
  const leadCountRows = await db
    .select({ stageId: schema.lead.stageId, n: sql<number>`count(*)` })
    .from(schema.lead)
    .where(scoped(schema.lead.organizationId, organizationId))
    .groupBy(schema.lead.stageId);
  const leadCountByStage = new Map(leadCountRows.map((r) => [r.stageId, Number(r.n)]));
  const pipeline = stages.map((s) => ({
    stageId: s.id,
    name: s.name,
    kind: s.kind,
    count: leadCountByStage.get(s.id) ?? 0,
  }));

  // Canais: conectados/total + volume de mensagens no período selecionado.
  const [officialCounts] = await db
    .select({
      total: sql<number>`count(*)`,
      connected: sql<number>`count(*) filter (where ${schema.metaCredentials.status} = 'connected' and ${schema.metaCredentials.isActive})`,
    })
    .from(schema.metaCredentials)
    .where(scoped(schema.metaCredentials.organizationId, organizationId));
  const [unofficialCounts] = await db
    .select({
      total: sql<number>`count(*)`,
      connected: sql<number>`count(*) filter (where ${schema.unofficialChannel.status} = 'connected' and ${schema.unofficialChannel.isActive})`,
    })
    .from(schema.unofficialChannel)
    .where(scoped(schema.unofficialChannel.organizationId, organizationId));

  const channelMsgRows = await db
    .select({
      channel: schema.conversation.channel,
      n: sql<number>`count(*)`,
    })
    .from(schema.message)
    .innerJoin(schema.conversation, eq(schema.message.conversationId, schema.conversation.id))
    .where(
      and(
        eq(schema.message.organizationId, organizationId),
        eq(schema.conversation.isTest, false),
        gte(schema.message.createdAt, since),
        deptScope
      )
    )
    .groupBy(schema.conversation.channel);
  const msgByChannel = new Map(channelMsgRows.map((r) => [r.channel, Number(r.n)]));

  return {
    summary: {
      openConversations: Number(summaryRow?.open ?? 0),
      agentsOnline: agents.filter((a) => a.status === "online").length,
      agentsTotal: agents.length,
      queueWaiting: Number(queueRow?.waiting ?? 0),
      queueLongestWaitMin:
        queueRow?.oldestMin != null ? Math.round(Number(queueRow.oldestMin)) : null,
      windowExpired: Number(summaryRow?.windowExpired ?? 0),
    },
    volumeByDay,
    agents,
    lab: {
      score: latestScore,
      delta: latestScore != null && prevScore != null ? latestScore - prevScore : null,
      handoffsToday: Number(handoffRow?.n ?? 0),
    },
    pipeline,
    channels: {
      official: {
        connected: Number(officialCounts?.connected ?? 0),
        total: Number(officialCounts?.total ?? 0),
        messages: msgByChannel.get("official") ?? 0,
      },
      unofficial: {
        connected: Number(unofficialCounts?.connected ?? 0),
        total: Number(unofficialCounts?.total ?? 0),
        messages: msgByChannel.get("unofficial") ?? 0,
      },
    },
  };
}
