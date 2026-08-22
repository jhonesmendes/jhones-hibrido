import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { periodStart, type DashboardPeriod } from "@/server/dashboard/queries";
import { seedDefaultPricingIfMissing } from "@/server/billing/pricing";

export type MetaCostCategory = "marketing" | "utility" | "authentication";

type CategoryBreakdown = Partial<Record<MetaCostCategory, { count: number; costBrl: number }>>;

export type MetaCostReport = {
  totalCostBrl: number;
  totalMessages: number;
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

  for (const r of rows) {
    const category = r.category as MetaCostCategory | null;
    if (!category) continue;
    const count = Number(r.n);
    const cost = count * priceFor(category, r.day);
    totalCostBrl += cost;
    totalMessages += count;

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

  return {
    totalCostBrl,
    totalMessages,
    byDepartment: [...byDepartment.values()].sort((a, b) => b.costBrl - a.costBrl),
    byAgent: [...byAgent.values()].sort((a, b) => b.costBrl - a.costBrl),
  };
}
