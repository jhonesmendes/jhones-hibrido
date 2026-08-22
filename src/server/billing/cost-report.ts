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
  /** "meta" = toda categoria com atividade usou o custo real da Meta;
   * "mixed" = algumas categorias vieram da Meta e outras caíram no preço
   * configurado (ex.: Meta ainda não processou o período mais recente —
   * ela tem alguns dias de atraso pra fechar o custo); "estimate" =
   * nenhuma categoria conseguiu confirmar com a Meta (sem número
   * acessível, token sem permissão, ou API fora do ar). */
  source: "meta" | "mixed" | "estimate";
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

  // Tenta substituir o custo estimado pelo valor REAL já cobrado pela Meta
  // (pricing_analytics), categoria por categoria. Duas armadilhas evitadas
  // aqui (ver histórico do bug real em produção):
  // 1) a Meta tem atraso pra fechar o custo de um período recente ("hoje"
  //    frequentemente chega com volume=0 ainda) — uma categoria sem volume
  //    reportado É TRATADA COMO NÃO SINCRONIZADA, não como "custou zero".
  // 2) mensagens de ANTES desta feature (ou de qualquer lacuna de rastreio
  //    local) não têm `meta_category` — o volume real da Meta pode ser
  //    maior que a nossa contagem local. Em vez de perder essa diferença
  //    (que é dinheiro de verdade gasto), ela vira uma linha própria
  //    "Não rastreado localmente" — assim o total sempre bate com a Meta.
  const synced = await trySyncWithMeta(organizationId, since);
  let anyMetaCategory = false;
  let anyEstimateCategory = false;

  if (synced) {
    for (const category of Object.keys(synced.byCategory) as MetaCostCategory[]) {
      const meta = synced.byCategory[category];
      if (!meta || meta.volume <= 0) {
        if (localCountByCategory[category] > 0) anyEstimateCategory = true;
        continue;
      }
      anyMetaCategory = true;
      const pricePerMessage = meta.cost / meta.volume;
      const localCount = localCountByCategory[category];

      // Substitui o custo estimado das linhas que JÁ conhecemos localmente.
      for (const entry of byDepartment.values()) {
        const cat = entry.byCategory[category];
        if (!cat) continue;
        entry.costBrl += cat.count * pricePerMessage - cat.costBrl;
        cat.costBrl = cat.count * pricePerMessage;
      }
      for (const entry of byAgent.values()) {
        const cat = entry.byCategory[category];
        if (!cat) continue;
        entry.costBrl += cat.count * pricePerMessage - cat.costBrl;
        cat.costBrl = cat.count * pricePerMessage;
      }

      // A diferença entre o volume real da Meta e o que rastreamos
      // localmente vai pra um bucket próprio (nunca é silenciosamente
      // descartada) — típico de mensagens enviadas antes desta feature.
      const untrackedVolume = meta.volume - localCount;
      if (untrackedVolume > 0) {
        const untrackedCost = untrackedVolume * pricePerMessage;
        addUntracked(byDepartment, untrackedCost, untrackedVolume, () => ({
          departmentId: "__untracked__",
          departmentName: "Não rastreado localmente (fora desta feature)",
          costBrl: 0,
          messages: 0,
          byCategory: {},
        }));
        addUntracked(byAgent, untrackedCost, untrackedVolume, () => ({
          memberId: "__untracked__",
          name: "Não rastreado localmente (fora desta feature)",
          costBrl: 0,
          messages: 0,
          byCategory: {},
        }));
        totalMessages += untrackedVolume;
      }
    }
    // Soma de baixo pra cima (linhas realmente exibidas), não um número
    // separado da Meta — assim o total sempre bate com o que aparece na
    // tela mesmo quando parte das categorias ainda está em estimativa
    // (Meta não processou) e parte já veio confirmada.
    totalCostBrl =
      [...byDepartment.values()].reduce((sum, e) => sum + e.costBrl, 0) +
      synced.otherCategoriesCost;
  }

  const source: MetaCostReport["source"] = anyMetaCategory
    ? anyEstimateCategory
      ? "mixed"
      : "meta"
    : "estimate";

  return {
    totalCostBrl,
    totalMessages,
    source,
    byDepartment: [...byDepartment.values()].sort((a, b) => b.costBrl - a.costBrl),
    byAgent: [...byAgent.values()].sort((a, b) => b.costBrl - a.costBrl),
  };
}

function addUntracked<T extends { costBrl: number; messages: number }>(
  map: Map<string, T>,
  cost: number,
  messages: number,
  makeDefault: () => T
): void {
  const entry = map.get("__untracked__") ?? makeDefault();
  entry.costBrl += cost;
  entry.messages += messages;
  map.set("__untracked__", entry);
}

/**
 * Busca custo + volume REAIS já reportados pela Meta no período (todas as
 * WABAs oficiais conectadas da organização), por categoria. `null` se
 * nenhuma WABA respondeu (sem número conectado, token sem permissão, ou API
 * fora do ar) — quem chama cai inteiramente no preço manual configurado.
 * Uma categoria com `volume: 0` significa "a Meta ainda não processou este
 * período pra essa categoria" (atraso normal, sobretudo pra "hoje"), NÃO
 * "custou zero" — quem chama trata isso como não sincronizado.
 */
async function trySyncWithMeta(
  organizationId: string,
  since: Date
): Promise<{
  byCategory: Partial<Record<MetaCostCategory, { cost: number; volume: number }>>;
  otherCategoriesCost: number;
} | null> {
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

  const byCategory: Partial<Record<MetaCostCategory, { cost: number; volume: number }>> = {};
  let otherCategoriesCost = 0;
  let anySucceeded = false;

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    anySucceeded = true;
    for (const point of result.value) {
      const cost = point.cost ?? 0;
      const volume = point.volume ?? 0;
      const localCategory = point.pricing_category ? META_CATEGORY_MAP[point.pricing_category] : undefined;
      if (!localCategory) {
        otherCategoriesCost += cost;
        continue;
      }
      const existing = byCategory[localCategory] ?? { cost: 0, volume: 0 };
      byCategory[localCategory] = { cost: existing.cost + cost, volume: existing.volume + volume };
    }
  }

  if (!anySucceeded) return null;
  return { byCategory, otherCategoriesCost };
}
