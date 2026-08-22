import { graphRequest } from "@/lib/meta/client";

/** Categorias que a Meta reporta em `pricing_analytics` — mapeadas pra
 * minúsculo nas nossas próprias categorias (marketing/utility/authentication)
 * quando possível; as demais (SERVICE, MARKETING_LITE, etc.) ficam de fora
 * do nosso rateio por agente/departamento porque `message.meta_category`
 * só é preenchido pra essas 3 (ver `sendTemplate`), mas entram no total
 * exibido — a Meta é a fonte da verdade do valor total gasto. */
export type MetaPricingCategory =
  | "AUTHENTICATION"
  | "AUTHENTICATION_INTERNATIONAL"
  | "MARKETING"
  | "MARKETING_LITE"
  | "SERVICE"
  | "UTILITY"
  | "REFERRAL_CONVERSION";

export type PricingAnalyticsPoint = {
  start: number;
  end: number;
  cost?: number;
  volume?: number;
  pricing_category?: MetaPricingCategory;
};

/**
 * Custo REAL já cobrado pela Meta nesse WABA, por categoria — direto do
 * Graph API (`pricing_analytics`), não uma conta nossa. Fonte da verdade
 * pro total exibido no relatório de custo (ver `src/server/billing/
 * cost-report.ts`); o rateio por agente/departamento continua sendo nosso,
 * proporcional às nossas contagens locais dentro de cada categoria.
 */
export async function fetchWabaPricingAnalytics(
  wabaId: string,
  token: string,
  sinceUnix: number,
  untilUnix: number
): Promise<PricingAnalyticsPoint[]> {
  const fieldsValue =
    `pricing_analytics.start(${sinceUnix}).end(${untilUnix}).granularity(DAILY)` +
    `.metric_types(["COST","VOLUME"]).dimensions(["PRICING_CATEGORY"])`;
  const path = `${wabaId}?fields=${encodeURIComponent(fieldsValue)}`;
  const result = await graphRequest<{ pricing_analytics?: { data?: PricingAnalyticsPoint[] } }>(
    path,
    { token, method: "GET" }
  );
  return result.pricing_analytics?.data ?? [];
}
