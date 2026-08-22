"use client";

import { useCallback, useEffect, useState } from "react";

type Category = "marketing" | "utility" | "authentication";

const CATEGORY_LABEL: Record<Category, string> = {
  marketing: "Marketing",
  utility: "Utilidade",
  authentication: "Autenticação",
};

type CategoryBreakdown = Partial<Record<Category, { count: number; costBrl: number }>>;

type CostReport = {
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

type PricingRule = {
  id: string;
  category: Category;
  priceBrl: string;
  validFrom: string;
  validTo: string | null;
};

type CostResponse = { report: CostReport; rules: PricingRule[]; period: string };

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Preço vigente (validTo null) de cada categoria — pega o de validFrom mais
 * recente se por acaso houver mais de uma linha aberta. */
function currentPrices(rules: PricingRule[]): Record<Category, string> {
  const out: Record<Category, string> = { marketing: "0", utility: "0", authentication: "0" };
  for (const cat of Object.keys(out) as Category[]) {
    const open = rules
      .filter((r) => r.category === cat && !r.validTo)
      .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
    if (open[0]) out[cat] = open[0].priceBrl;
  }
  return out;
}

export function ClientCostSection({ clientId }: { clientId: string }) {
  const [data, setData] = useState<CostResponse | null>(null);
  const [prices, setPrices] = useState<Record<Category, string>>({
    marketing: "0",
    utility: "0",
    authentication: "0",
  });
  const [saving, setSaving] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/admin/clients/${clientId}/cost?period=30d`).catch(() => null);
    if (!res?.ok) return;
    const json = (await res.json()) as CostResponse;
    setData(json);
    setPrices(currentPrices(json.rules));
  }, [clientId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function savePrice(category: Category) {
    const priceBrl = Number(prices[category].replace(",", "."));
    if (Number.isNaN(priceBrl) || priceBrl < 0) {
      setError("Preço inválido");
      return;
    }
    setSaving(category);
    setError(null);
    setSavedMsg(null);
    const res = await fetch(`/api/admin/clients/${clientId}/cost`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category, priceBrl }),
    }).catch(() => null);
    setSaving(null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Não foi possível salvar");
      return;
    }
    setSavedMsg(`Preço de ${CATEGORY_LABEL[category]} atualizado — vale a partir de hoje.`);
    void refetch();
  }

  if (!data) return <p className="text-white/50">Carregando custos…</p>;

  return (
    <div className="space-y-4 rounded-lg border border-white/10 p-4">
      <div>
        <p className="text-sm font-medium text-white/70">Custos Meta (cobrança por mensagem)</p>
        <p className="text-xs text-white/40">
          {data.report.source === "meta" &&
            "Valor real, buscado direto da Meta (pricing_analytics) — o preço abaixo só vale como fallback se a instância ficar sem número oficial acessível."}
          {data.report.source === "mixed" &&
            "Parcialmente real — a Meta ainda não fechou o custo do período mais recente pra alguma categoria; essa parte usa o preço configurado abaixo."}
          {data.report.source === "estimate" &&
            "Estimativa: instância sem número oficial acessível agora — usando o preço configurado abaixo."}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => (
          <div key={cat} className="space-y-1">
            <label className="text-xs text-white/50">{CATEGORY_LABEL[cat]} (R$/msg, fallback)</label>
            <div className="flex gap-1">
              <input
                type="text"
                inputMode="decimal"
                value={prices[cat]}
                onChange={(e) => setPrices((p) => ({ ...p, [cat]: e.target.value }))}
                className="w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm"
              />
              <button
                disabled={saving === cat}
                onClick={() => void savePrice(cat)}
                className="shrink-0 rounded-md bg-brand px-2 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving === cat ? "…" : "Salvar"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {savedMsg && <p className="text-sm text-emerald-400">{savedMsg}</p>}

      <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
        <div>
          <p className="text-xs text-white/50">Custo total (30 dias)</p>
          <p className="text-lg font-medium">{fmtBRL(data.report.totalCostBrl)}</p>
        </div>
        <div>
          <p className="text-xs text-white/50">Mensagens cobradas</p>
          <p className="text-lg font-medium">{data.report.totalMessages}</p>
        </div>
      </div>

      {data.report.byDepartment.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs uppercase text-white/50">Por departamento</p>
          <div className="space-y-1">
            {data.report.byDepartment.map((d) => (
              <div
                key={d.departmentId ?? "none"}
                className="flex items-center justify-between rounded-md border border-white/10 px-3 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{d.departmentName}</span>
                <span className="font-medium">{fmtBRL(d.costBrl)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
