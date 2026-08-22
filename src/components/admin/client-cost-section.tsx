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

export function ClientCostSection({
  clientId,
  compact = false,
}: {
  clientId: string;
  /** true = sem a moldura própria (uso dentro de um card que já tem borda,
   * ex. o accordion da lista de Instâncias). */
  compact?: boolean;
}) {
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

  if (!data) return <p className="text-[#4a5070]">Carregando custos…</p>;

  return (
    <div className={compact ? "space-y-3" : "space-y-4 rounded-lg border border-[#1e2130] p-4"}>
      {!compact && (
        <div>
          <p className="text-sm font-medium text-[#c0c8e8]">Custos Meta (cobrança por mensagem)</p>
          <p className="text-xs text-[#4a5070]">
            {data.report.source === "meta" &&
              "Valor real, buscado direto da Meta (pricing_analytics) — o preço abaixo só vale como fallback se a instância ficar sem número oficial acessível."}
            {data.report.source === "mixed" &&
              "Parcialmente real — a Meta ainda não fechou o custo do período mais recente pra alguma categoria; essa parte usa o preço configurado abaixo."}
            {data.report.source === "estimate" &&
              "Estimativa: instância sem número oficial acessível agora — usando o preço configurado abaixo."}
          </p>
        </div>
      )}

      <div className={compact ? "flex items-center justify-between" : "grid grid-cols-2 gap-2"}>
        <div>
          <p className="text-[10px] text-[#4a5070]">Total cobrado (30d)</p>
          <p className={compact ? "text-base font-medium text-[#7c9ff5]" : "text-lg font-medium text-[#e8eaf2]"}>
            {fmtBRL(data.report.totalCostBrl)}
          </p>
        </div>
        {!compact && (
          <div>
            <p className="text-xs text-[#4a5070]">Mensagens cobradas</p>
            <p className="text-lg font-medium text-[#e8eaf2]">{data.report.totalMessages}</p>
          </div>
        )}
      </div>

      {data.report.byDepartment.length > 0 ? (
        <div>
          {!compact && <p className="mb-1.5 text-xs uppercase text-[#4a5070]">Por departamento</p>}
          <div className={compact ? "" : "space-y-1"}>
            {data.report.byDepartment.map((d) =>
              compact ? (
                <div
                  key={d.departmentId ?? "none"}
                  className="flex items-center justify-between border-b border-[#141826] py-1 text-xs last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[#6070a0]">{d.departmentName}</span>
                  <span className="font-medium text-[#c0c8e8]">{fmtBRL(d.costBrl)}</span>
                </div>
              ) : (
                <div
                  key={d.departmentId ?? "none"}
                  className="flex items-center justify-between rounded-md border border-[#1e2130] px-3 py-1.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{d.departmentName}</span>
                  <span className="font-medium">{fmtBRL(d.costBrl)}</span>
                </div>
              )
            )}
          </div>
        </div>
      ) : (
        compact && <p className="text-xs text-[#3a4060]">Sem dados de departamento</p>
      )}

      <div>
        {!compact && (
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[#3a4060]">
            Preços por categoria
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => (
            <div key={cat} className="min-w-[80px] flex-1 space-y-1">
              <label className="text-[10px] text-[#4a5070]">{CATEGORY_LABEL[cat]} (R$/msg)</label>
              <div className="flex gap-1">
                <input
                  type="text"
                  inputMode="decimal"
                  value={prices[cat]}
                  onChange={(e) => setPrices((p) => ({ ...p, [cat]: e.target.value }))}
                  className="w-full rounded-md border border-[#1e2130] bg-[#0f1117] px-2 py-1 text-xs text-[#c0c8e8] outline-none focus:border-[#2a4090]"
                />
                <button
                  disabled={saving === cat}
                  onClick={() => void savePrice(cat)}
                  className="shrink-0 rounded-md border border-[#1e2540] px-2 py-1 text-[11px] text-[#7c9ff5] transition-colors hover:bg-[#1e2540] disabled:opacity-50"
                >
                  {saving === cat ? "…" : "Salvar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-[#f07070]">{error}</p>}
      {savedMsg && <p className="text-sm text-[#4ecb8d]">{savedMsg}</p>}
    </div>
  );
}
