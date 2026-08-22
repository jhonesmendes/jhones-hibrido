import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { periodStart, type DashboardPeriod } from "@/server/dashboard/queries";
import { seedDefaultPricingIfMissing } from "@/server/billing/pricing";
import { listCredentialsByOrg } from "@/server/whatsapp/credentials";
import {
  fetchWabaPricingAnalytics,
  type MetaPricingCategory,
} from "@/lib/meta/pricing-analytics";

export type MetaCostCategory = "marketing" | "utility" | "authentication";

type CategoryBreakdown = Partial<Record<MetaCostCategory, { count: number; costBrl: number }>>;

export type MetaCostReport = {
  totalCostBrl: number;
  totalMessages: number;
  /** "meta" = totalCostBrl veio direto da Meta (pricing_analytics, valor
   * real já cobrado); "estimate" = calculado localmente (contagem × preço
   * configurado em Configurações → nenhum número oficial acessível agora,
   * ou a chamada à Meta falhou). */
  source: "meta" | "estimate";
  byDepartment: {
    departmentId: string | null;
    departmentName: string;
    costBrl: number;
    messages: number;
    byCategory: CategoryBreakdown;
  }[];
  /** Ranking por agente — dado sensível, quem chama decide se expõe (ver
   * `/api/dashboard`: mesmo gate de role que o resto do dashboard). Bucket
   * `memberId: null` = mensagem sem agente humano (disparo de campanha). */
  byAgent: {
    memberId: string | null;
    name: string;
    costBrl: number;
    messages: number;
    byCategory: CategoryBreakdown;
  }[];
};

/** Mapa da categoria que a Meta reporta em `pricing_analytics` pras 3
 * categorias que rastreamos localmente (`message.meta_category`) — as
 * demais (SERVICE, REFERRAL_CONVERSION...) entram no total real mas não têm
 * como ser rateadas por departamento/agente (não geram `meta_category`). */
const META_CATEGORY_MAP: Partial<Record<MetaPricingCategory, MetaCostCategory>> = {
  MARKETING: "marketing",
  MARKETING_LITE: "marketing",
  UTILITY: "utility",
  AUTHENTICATION: "authentication",
  AUTHENTICATION_INTERNATIONAL: "authentication",
};

/**
 * Rateio de custo Meta (cobrança por mensagem, vigente desde jul/2025 — ver
 * `message.meta_category`) — agregado por departamento e por agente, com o
 * preço vigente em CADA dia (histórico nunca muda mesmo se o preço mudar
 * depois). Mensagens de sessão (meta_category null) são gratuitas nesse
 * modelo e não entram no relatório.
 */
export async function getMetaCostReport(
  organizationId: string,
  visibleDepartmentIds: string[] | null,
  period: DashboardPeriod
): Promise<MetaCostReport> {
  const db = getDb();
  const since = periodStart(period);

  await seedDefaultPricingIfMissing(organizationId);

  const priceRules = await db
    .select()
    .from(schema.metaPricingRule)
    .where(scoped(schema.metaPricingRule.organizationId, organizationId));

  const priceFor = (category: string, dayStr: string): number => {
    const candidates = priceRules.filter(
      (r) =>
        r.category === category &&
        r.validFrom <= dayStr &&
        (!r.validTo || r.validTo >= dayStr)
    );
    if (candidates.length === 0) return 0;
    candidates.sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
    return Number(candidates[0]!.priceBrl);
  };

  const deptScope =
    visibleDepartmentIds !== null
      ? inArray(schema.conversation.departmentId, visibleDepartmentIds)
      : undefined;

  const rows = await db
    .select({
      day: sql<string>`to_char(${schema.message.createdAt}, 'YYYY-MM-DD')`,
      category: schema.message.metaCategory,
      departmentId: schema.conversation.departmentId,
      sentByMemberId: schema.message.sentByMemberId,
      n: sql<number>`count(*)`,
    })
    .from(schema.message)
    .innerJoin(schema.conversation, eq(schema.message.conversationId, schema.conversation.id))
    .where(
      and(
        eq(schema.message.organizationId, organizationId),
        eq(schema.conversation.isTest, false),
        eq(schema.message.direction, "out"),
        sql`${schema.message.metaCategory} is not null`,
        gte(schema.message.createdAt, since),
        deptScope
      )
    )
    .groupBy(
      sql`to_char(${schema.message.createdAt}, 'YYYY-MM-DD')`,
      schema.message.metaCategory,
      schema.conversation.departmentId,
      schema.message.sentByMemberId
    );

  const deptRows = await db
    .select({ id: schema.department.id, name: schema.department.name })
    .from(schema.department)
    .where(
      visibleDepartmentIds !== null
        ? and(
            scoped(schema.department.organizationId, organizationId),
            inArray(schema.department.id, visibleDepartmentIds)
          )
        : scoped(schema.department.organizationId, organizationId)
    );
  const deptNameById = new Map<string | null, string>(deptRows.map((d) => [d.id, d.name]));
  deptNameById.set(null, deptRows.length > 0 ? "Sem departamento" : "Organização inteira");

  const memberRows = await db
    .select({ id: schema.member.id, name: schema.user.name })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(scoped(schema.member.organizationId, organizationId));
  const memberNameById = new Map(memberRows.map((m) => [m.id, m.name]));

  const byDepartment = new Map<
    string,
    { departmentId: string | null; departmentName: string; costBrl: number; messages: number; byCategory: CategoryBreakdown }
  >();
  const byAgent = new Map<
    string,
    { memberId: string | null; name: string; costBrl: number; messages: number; byCategory: CategoryBreakdown }
  >();
  let totalCostBrl = 0;
  let totalMessages = 0;

  const localCountByCategory: Record<MetaCostCategory, number> = {
    marketing: 0,
    utility: 0,
    authentication: 0,
  };

  for (const r of rows) {
    const category = r.category as MetaCostCategory | null;
    if (!category) continue;
    const count = Number(r.n);
    const cost = count * priceFor(category, r.day);
    totalCostBrl += cost;
    totalMessages += count;
    localCountByCategory[category] += count;

    const deptKey = r.departmentId ?? "__none__";
    const deptEntry = byDepartment.get(deptKey) ?? {
      departmentId: r.departmentId,
      departmentName: deptNameById.get(r.departmentId) ?? "Sem departamento",
      costBrl: 0,
      messages: 0,
      byCategory: {},
    };
    deptEntry.costBrl += cost;
    deptEntry.messages += count;
    deptEntry.byCategory[category] = {
      count: (deptEntry.byCategory[category]?.count ?? 0) + count,
      costBrl: (deptEntry.byCategory[category]?.costBrl ?? 0) + cost,
    };
    byDepartment.set(deptKey, deptEntry);

    const agentKey = r.sentByMemberId ?? "__none__";
    const agentEntry = byAgent.get(agentKey) ?? {
      memberId: r.sentByMemberId,
      name: r.sentByMemberId
        ? memberNameById.get(r.sentByMemberId) ?? "Removido"
        : "Campanhas / automático",
      costBrl: 0,
      messages: 0,
      byCategory: {},
    };
    agentEntry.costBrl += cost;
    agentEntry.messages += count;
    agentEntry.byCategory[category] = {
      count: (agentEntry.byCategory[category]?.count ?? 0) + count,
      costBrl: (agentEntry.byCategory[category]?.costBrl ?? 0) + cost,
    };
    byAgent.set(agentKey, agentEntry);
  }

  // Tenta substituir o total/custo por categoria pelo valor REAL já cobrado
  // pela Meta (pricing_analytics) — o preço configurado manualmente vira só
  // um fallback (org sem número oficial acessível, ou a chamada falhou).
  const synced = await trySyncWithMeta(organizationId, since, localCountByCategory);
  if (synced) {
    for (const category of Object.keys(synced.costPerMessage) as MetaCostCategory[]) {
      const costPerMessage = synced.costPerMessage[category];
      if (costPerMessage === undefined) continue;
      for (const entry of byDepartment.values()) {
        const cat = entry.byCategory[category];
        if (!cat) continue;
        entry.costBrl += cat.count * costPerMessage - cat.costBrl;
        cat.costBrl = cat.count * costPerMessage;
      }
      for (const entry of byAgent.values()) {
        const cat = entry.byCategory[category];
        if (!cat) continue;
        entry.costBrl += cat.count * costPerMessage - cat.costBrl;
        cat.costBrl = cat.count * costPerMessage;
      }
    }
    totalCostBrl = synced.totalCostBrl;
  }

  return {
    totalCostBrl,
    totalMessages,
    source: synced ? "meta" : "estimate",
    byDepartment: [...byDepartment.values()].sort((a, b) => b.costBrl - a.costBrl),
    byAgent: [...byAgent.values()].sort((a, b) => b.costBrl - a.costBrl),
  };
}

/**
 * Busca o custo REAL já cobrado pela Meta no período (todas as WABAs
 * oficiais conectadas da organização) e devolve o custo-por-mensagem
 * implícito em cada categoria (custo real ÷ contagem local) — usado só pra
 * substituir o custo estimado nas entradas por departamento/agente, sem
 * mudar a contagem. `null` se nenhuma WABA respondeu (sem número conectado,
 * token inválido, ou API indisponível) — quem chama cai no preço manual.
 */
async function trySyncWithMeta(
  organizationId: string,
  since: Date,
  localCountByCategory: Record<MetaCostCategory, number>
): Promise<{ totalCostBrl: number; costPerMessage: Partial<Record<MetaCostCategory, number>> } | null> {
  const credentials = (await listCredentialsByOrg(organizationId)).filter(
    (c) => c.isActive && c.status === "connected"
  );
  if (credentials.length === 0) return null;

  const byWaba = new Map<string, string>();
  for (const c of credentials) {
    if (!byWaba.has(c.wabaId)) byWaba.set(c.wabaId, c.token);
  }

  const sinceUnix = Math.floor(since.getTime() / 1000);
  const untilUnix = Math.floor(Date.now() / 1000);

  const results = await Promise.allSettled(
    [...byWaba.entries()].map(([wabaId, token]) =>
      fetchWabaPricingAnalytics(wabaId, token, sinceUnix, untilUnix)
    )
  );

  let totalCostBrl = 0;
  const realCostByCategory: Partial<Record<MetaCostCategory, number>> = {};
  let anySucceeded = false;

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    anySucceeded = true;
    for (const point of result.value) {
      const cost = point.cost ?? 0;
      totalCostBrl += cost;
      const localCategory = point.pricing_category ? META_CATEGORY_MAP[point.pricing_category] : undefined;
      if (!localCategory) continue;
      realCostByCategory[localCategory] = (realCostByCategory[localCategory] ?? 0) + cost;
    }
  }

  if (!anySucceeded) return null;

  const costPerMessage: Partial<Record<MetaCostCategory, number>> = {};
  for (const category of Object.keys(realCostByCategory) as MetaCostCategory[]) {
    const localCount = localCountByCategory[category];
    const realCost = realCostByCategory[category] ?? 0;
    if (localCount > 0) costPerMessage[category] = realCost / localCount;
  }

  return { totalCostBrl, costPerMessage };
}
