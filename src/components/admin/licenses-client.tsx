"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { AdminTopbar, AdminButtonGhost } from "@/components/admin/admin-topbar";
import { KpiCard } from "@/components/admin/kpi-card";

type ClientRow = {
  id: string;
  name: string;
  baseUrl: string;
  reachable: boolean;
  license: {
    type: string;
    status: string;
    maxAgents: number;
    addonAgents: number;
    trialEndsAt: string | null;
  } | null;
  usage: { maxAgents: number } | null;
};

const PLAN_LABEL: Record<string, string> = {
  trial: "Trial",
  starter: "Starter",
  business: "Business",
  enterprise: "Enterprise",
};

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function AdminLicensesClient() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);

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

  const sorted = [...clients].sort((a, b) => {
    const da = a.license?.trialEndsAt ? daysUntil(a.license.trialEndsAt) : Infinity;
    const db = b.license?.trialEndsAt ? daysUntil(b.license.trialEndsAt) : Infinity;
    return da - db;
  });
  const trialCount = clients.filter((c) => c.license?.type === "trial").length;
  const suspendedCount = clients.filter((c) => c.license?.status === "suspended").length;

  return (
    <>
      <AdminTopbar
        title="Licenças"
        subtitle="Plano, status e uso de agentes por instância"
        actions={<AdminButtonGhost onClick={() => void refetch()}>Atualizar</AdminButtonGhost>}
      />
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <KpiCard icon={<Receipt className="h-3.5 w-3.5" />} label="Instâncias" value={clients.length} accent="blue" />
          <KpiCard icon={<Receipt className="h-3.5 w-3.5" />} label="Em trial" value={trialCount} accent="amber" />
          <KpiCard icon={<Receipt className="h-3.5 w-3.5" />} label="Suspensas" value={suspendedCount} accent={suspendedCount > 0 ? "red" : "green"} />
        </div>

        <div className="overflow-hidden rounded-[10px] border border-[#1e2130] bg-[#13161f]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2130] bg-[#0f1117] text-left text-[11px] uppercase tracking-wide text-[#3a4060]">
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Plano</th>
                <th className="px-4 py-2 text-right">Agentes</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Vencimento</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const days = c.license?.trialEndsAt ? daysUntil(c.license.trialEndsAt) : null;
                return (
                  <tr key={c.id} className="border-b border-[#1a1e2e] last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-[#c0c8e8]">{c.name}</p>
                      <p className="text-[11px] text-[#3a4060]">{c.baseUrl}</p>
                    </td>
                    <td className="px-4 py-2.5 text-[#8890b0]">
                      {c.license ? PLAN_LABEL[c.license.type] ?? c.license.type : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#8890b0]">
                      {c.usage && c.license ? `${c.usage.maxAgents} / ${c.license.maxAgents + c.license.addonAgents}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {!c.reachable ? (
                        <span className="text-[#f07070]">Inacessível</span>
                      ) : c.license?.status === "active" ? (
                        <span className="text-[#4ecb8d]">Ativo</span>
                      ) : (
                        <span className="text-[#f0b429]">{c.license?.status ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {days != null ? (
                        <span className={days <= 3 ? "font-medium text-[#f0b429]" : "text-[#8890b0]"}>
                          {days >= 0 ? `${days} dia(s)` : "expirado"}
                        </span>
                      ) : (
                        <span className="text-[#3a4060]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/admin/clients/${c.id}`} className="text-xs text-[#7c9ff5] hover:underline">
                        Gerenciar
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#3a4060]">
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
