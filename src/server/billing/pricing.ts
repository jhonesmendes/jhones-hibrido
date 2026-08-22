import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import type { MetaCostCategory } from "@/server/billing/cost-report";

export type MetaPricingRuleRow = typeof schema.metaPricingRule.$inferSelect;

const BILLABLE_CATEGORIES: MetaCostCategory[] = ["marketing", "utility", "authentication"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function listPricingRules(organizationId: string): Promise<MetaPricingRuleRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.metaPricingRule)
    .where(scoped(schema.metaPricingRule.organizationId, organizationId))
    .orderBy(schema.metaPricingRule.category, schema.metaPricingRule.validFrom);
}

/**
 * Garante que as 3 categorias cobradas existam com pelo menos 1 linha —
 * preço 0 até o operador configurar o valor real (nunca inventamos um
 * número de custo; ver `instrução-rateio-custo-meta` do dono sobre não
 * hardcodear preço da Meta). Idempotente — não faz nada se já existir
 * qualquer linha da categoria.
 */
export async function seedDefaultPricingIfMissing(organizationId: string): Promise<void> {
  const db = getDb();
  const existing = await listPricingRules(organizationId);
  const existingCategories = new Set(existing.map((r) => r.category));
  const missing = BILLABLE_CATEGORIES.filter((c) => !existingCategories.has(c));
  if (missing.length === 0) return;

  await db.insert(schema.metaPricingRule).values(
    missing.map((category) => ({
      id: newId("metaPricingRule"),
      organizationId,
      category,
      priceBrl: "0",
      validFrom: todayIso(),
      validTo: null,
    }))
  );
}

/**
 * Nova vigência de preço — NUNCA faz UPDATE no valor de uma linha existente
 * (o custo de mensagens antigas não pode mudar retroativamente). Fecha a
 * vigência anterior (best-effort, só pra auditoria — a leitura em
 * `cost-report.ts` já escolhe corretamente o preço mais recente cujo
 * `validFrom` seja <= o dia da mensagem, mesmo que `validTo` fique aberto)
 * e insere a nova linha a partir de hoje.
 */
export async function setPricingRule(
  organizationId: string,
  category: MetaCostCategory,
  priceBrl: number
): Promise<MetaPricingRuleRow> {
  const db = getDb();

  await db
    .update(schema.metaPricingRule)
    .set({ validTo: yesterdayIso() })
    .where(
      and(
        eq(schema.metaPricingRule.organizationId, organizationId),
        eq(schema.metaPricingRule.category, category),
        isNull(schema.metaPricingRule.validTo)
      )
    );

  const inserted = await db
    .insert(schema.metaPricingRule)
    .values({
      id: newId("metaPricingRule"),
      organizationId,
      category,
      priceBrl: priceBrl.toFixed(6),
      validFrom: todayIso(),
      validTo: null,
    })
    .returning();
  return inserted[0]!;
}
