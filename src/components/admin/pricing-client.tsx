"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { AdminTopbar, AdminButtonGhost } from "@/components/admin/admin-topbar";

type Category = "marketing" | "utility" | "authentication";

const CATEGORIES: Category[] = ["marketing", "utility", "authentication"];
const CATEGORY_LABEL: Record<Category, string> = {
  marketing: "Marketing",
  utility: "Utilidade",
  authentication: "Autenticação",
};

type ClientRow = { id: string; name: string; baseUrl: string; reachable: boolean };
type PricingRule = { category: Category; priceBrl: string; validTo: string | null; validFrom: string };
type ClientPricing = { id: string; name: string; prices: Record<Category, string> };

function currentPrices(rules: PricingRule[]): Record<Category, string> {
  const out: Record<Category, string> = { marketing: "0", utility: "0", authentication: "0" };
  for (const cat of CATEGORIES) {
    const open = rules
      .filter((r) => r.category === cat && !r.validTo)
      .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
    if (open[0]) out[cat] = open[0].priceBrl;
  }
  return out;
}

export function AdminPricingClient() {
  const [rows, setRows] = useState<ClientPricing[] | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<Category, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/admin/clients").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { clients: ClientRow[] };

    const results = await Promise.all(
      data.clients.map(async (c) => {
        const r = await fetch(`/api/admin/clients/${c.id}/cost`).catch(() => null);
        if (!r?.ok) return { id: c.id, name: c.name, prices: currentPrices([]) };
        const json = (await r.json()) as { rules: PricingRule[] };
        return { id: c.id, name: c.name, prices: currentPrices(json.rules) };
      })
    );
    setRows(results);
    setEdits(Object.fromEntries(results.map((r) => [r.id, r.prices])));
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function saveAll(clientId: string) {
    setSaving(clientId);
    setError(null);
    const prices = edits[clientId];
    if (!prices) return;
    try {
      for (const category of CATEGORIES) {
        const priceBrl = Number(prices[category].replace(",", "."));
        if (Number.isNaN(priceBrl) || priceBrl < 0) throw new Error(`Preço de ${CATEGORY_LABEL[category]} inválido`);
        const res = await fetch(`/api/admin/clients/${clientId}/cost`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ category, priceBrl }),
        });
        if (!res.ok) throw new Error("Não foi possível salvar");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    }
    setSaving(null);
    void refetch();
  }

  if (rows === null) return <p className="p-5 text-[#4a5070]">Carregando…</p>;

  return (
    <>
      <AdminTopbar
        title="Tabela de preços"
        subtitle="Preço por mensagem de categoria, por instância — nova vigência a partir de hoje, nunca sobrescreve o histórico"
        actions={<AdminButtonGhost onClick={() => void refetch()}>Atualizar</AdminButtonGhost>}
      />
      <div className="space-y-4 p-5">
        {error && <p className="text-sm text-[#f07070]">{error}</p>}
        <div className="overflow-hidden rounded-[10px] border border-[#1e2130] bg-[#13161f]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2130] bg-[#0f1117] text-left text-[11px] uppercase tracking-wide text-[#3a4060]">
                <th className="px-4 py-2">Cliente</th>
                {CATEGORIES.map((cat) => (
                  <th key={cat} className="px-4 py-2">
                    {CATEGORY_LABEL[cat]} (R$/msg)
                  </th>
                ))}
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[#1a1e2e] last:border-0">
                  <td className="px-4 py-2.5 font-medium text-[#c0c8e8]">{r.name}</td>
                  {CATEGORIES.map((cat) => (
                    <td key={cat} className="px-4 py-2.5">
                      <input
                        value={edits[r.id]?.[cat] ?? "0"}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [r.id]: { ...prev[r.id]!, [cat]: e.target.value },
                          }))
                        }
                        className="w-24 rounded-md border border-[#1e2130] bg-[#0f1117] px-2 py-1 text-xs text-[#c0c8e8] outline-none focus:border-[#2a4090]"
                      />
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right">
                    <button
                      disabled={saving === r.id}
                      onClick={() => void saveAll(r.id)}
                      className="rounded-md border border-[#1e2540] px-2.5 py-1 text-xs text-[#7c9ff5] transition-colors hover:bg-[#1e2540] disabled:opacity-50"
                    >
                      {saving === r.id ? "Salvando…" : "Salvar"}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-[#3a4060]">
                    <Coins className="mx-auto mb-2 h-5 w-5 text-[#3a4060]" />
                    Nenhum cliente registrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
