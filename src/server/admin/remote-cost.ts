import { decryptClientSecret, type AdminClientRow } from "@/server/admin/client-registry";

export type RemoteCostCategory = "marketing" | "utility" | "authentication";

type CategoryBreakdown = Partial<Record<RemoteCostCategory, { count: number; costBrl: number }>>;

export type RemoteCostReport = {
  totalCostBrl: number;
  totalMessages: number;
  source: "meta" | "mixed" | "estimate";
  byDepartment: {
    departmentId: string | null;
    departmentName: string;
    costBrl: number;
    messages: number;
    byCategory: CategoryBreakdown;
  }[];
  byAgent: {
    memberId: string | null;
    name: string;
    costBrl: number;
    messages: number;
    byCategory: CategoryBreakdown;
  }[];
};

export type RemotePricingRule = {
  id: string;
  organizationId: string;
  category: RemoteCostCategory;
  priceBrl: string;
  validFrom: string;
  validTo: string | null;
};

export class RemoteCostError extends Error {}

async function callInternalApi<T>(
  client: AdminClientRow,
  path: string,
  init?: RequestInit
): Promise<T> {
  const secret = decryptClientSecret(client);
  const res = await fetch(`${client.baseUrl}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      "x-license-control-secret": secret,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  }).catch((cause) => {
    throw new RemoteCostError(
      cause instanceof Error ? cause.message : "Falha ao contatar a instância"
    );
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new RemoteCostError(body?.error?.message ?? `A instância respondeu ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchRemoteCostReport(
  client: AdminClientRow,
  period: "today" | "7d" | "30d" = "30d"
): Promise<{ report: RemoteCostReport; period: string }> {
  return callInternalApi(client, `/api/internal/cost-report?period=${period}`);
}

export async function fetchRemotePricingRules(
  client: AdminClientRow
): Promise<{ rules: RemotePricingRule[] }> {
  return callInternalApi(client, "/api/internal/meta-pricing");
}

export async function pushRemotePricingRule(
  client: AdminClientRow,
  category: RemoteCostCategory,
  priceBrl: number
): Promise<{ rule: RemotePricingRule }> {
  return callInternalApi(client, "/api/internal/meta-pricing", {
    method: "PATCH",
    body: JSON.stringify({ category, priceBrl }),
  });
}
