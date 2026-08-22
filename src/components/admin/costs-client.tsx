"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Coins } from "lucide-react";
import { AdminTopbar, AdminButtonGhost } from "@/components/admin/admin-topbar";
import { KpiCard } from "@/components/admin/kpi-card";
import { ClientCostSection } from "@/components/admin/client-cost-section";

type ClientRow = {
  id: string;
  name: string;
  baseUrl: string;
  reachable: boolean;
  costBrl30d: number | null;
};

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AdminCostsClient() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/admin/clients").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { clients: ClientRow[] };
    setClients(data.clients);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (clients === null) return <p className="p-5 text-[#4a5070]">Carregando…</p>;

  const totalCostBrl = clients.reduce((sum, c) => sum + (c.costBrl30d ?? 0), 0);
  const known = clients.filter((c) => c.costBrl30d != null);
  const ranked = [...clients].sort((a, b) => (b.costBrl30d ?? -1) - (a.costBrl30d ?? -1));

  return (
    <>
      <AdminTopbar
        title="Custos Meta"
        subtitle="Custo consolidado das mensagens de template, por instância"
        actions={<AdminButtonGhost onClick={() => void refetch()}>Atualizar</AdminButtonGhost>}
      />
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <KpiCard icon={<Coins className="h-3.5 w-3.5" />} label="Total consolidado (30d)" value={fmtBRL(totalCostBrl)} accent="blue" />
          <KpiCard icon={<Coins className="h-3.5 w-3.5" />} label="Instâncias com dado de custo" value={`${known.length} / ${clients.length}`} accent="none" />
          <KpiCard
            icon={<Coins className="h-3.5 w-3.5" />}
            label="Maior custo"
            value={ranked[0]?.costBrl30d != null ? fmtBRL(ranked[0].costBrl30d) : "—"}
            sub={ranked[0]?.name}
            accent="amber"
          />
        </div>

        <div className="overflow-hidden rounded-[10px] border border-[#1e2130] bg-[#13161f]">
          <div className="border-b border-[#1e2130] px-4 py-3">
            <p className="text-[13px] font-medium text-[#c0c8e8]">Por instância (30 dias)</p>
          </div>
          {ranked.map((c) => (
            <div key={c.id}>
              <div
                className={`flex cursor-pointer items-center gap-3 border-b border-[#1a1e2e] px-4 py-2.5 transition-colors hover:bg-[#15192a] ${openId === c.id ? "bg-[#15192a]" : ""}`}
                onClick={() => setOpenId((id) => (id === c.id ? null : c.id))}
              >
                <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.reachable ? "#4ecb8d" : "#f07070" }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[#c0c8e8]">{c.name}</p>
                  <p className="truncate text-[11px] text-[#3a4060]">{c.baseUrl}</p>
                </div>
                <span className="w-28 shrink-0 text-right text-[13px] font-medium text-[#e8eaf2]">
                  {c.costBrl30d != null ? fmtBRL(c.costBrl30d) : "—"}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-[#3a4060] transition-transform ${openId === c.id ? "rotate-180" : ""}`}
                />
              </div>
              {openId === c.id && (
                <div className="border-b border-[#1a1e2e] bg-[#0d1020] px-4 py-3.5 pl-9">
                  <div className="max-w-md rounded-[10px] border border-[#1e2130] bg-[#13161f] p-3.5">
                    <ClientCostSection clientId={c.id} compact />
                  </div>
                </div>
              )}
            </div>
          ))}
          {ranked.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-[#3a4060]">Nenhum cliente registrado ainda.</p>
          )}
        </div>
      </div>
    </>
  );
}
