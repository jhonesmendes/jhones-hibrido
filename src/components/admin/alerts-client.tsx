"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Ban, ChevronRight, Clock, WifiOff } from "lucide-react";
import { AdminTopbar, AdminButtonGhost } from "@/components/admin/admin-topbar";

type ClientRow = {
  id: string;
  name: string;
  baseUrl: string;
  reachable: boolean;
  license: { status: string; trialEndsAt: string | null } | null;
};

type Alert = {
  clientId: string;
  clientName: string;
  type: "unreachable" | "suspended" | "expiring";
  message: string;
};

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

const ICON: Record<Alert["type"], React.ComponentType<{ className?: string }>> = {
  unreachable: WifiOff,
  suspended: Ban,
  expiring: Clock,
};

const COLOR: Record<Alert["type"], string> = {
  unreachable: "text-[#f07070]",
  suspended: "text-[#f07070]",
  expiring: "text-[#f0b429]",
};

function computeAlerts(clients: ClientRow[]): Alert[] {
  const alerts: Alert[] = [];
  for (const c of clients) {
    if (!c.reachable) {
      alerts.push({ clientId: c.id, clientName: c.name, type: "unreachable", message: "Instância inacessível — a última tentativa de contato falhou." });
    }
    if (c.license?.status === "suspended") {
      alerts.push({ clientId: c.id, clientName: c.name, type: "suspended", message: "Licença suspensa." });
    }
    if (c.license?.trialEndsAt) {
      const days = daysUntil(c.license.trialEndsAt);
      if (days <= 3 && days >= 0) {
        alerts.push({
          clientId: c.id,
          clientName: c.name,
          type: "expiring",
          message: days === 0 ? "Trial expira hoje." : `Trial expira em ${days} dia(s).`,
        });
      }
    }
  }
  return alerts;
}

export function AdminAlertsClient() {
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

  const alerts = computeAlerts(clients);

  return (
    <>
      <AdminTopbar
        title="Alertas"
        subtitle="Instâncias inacessíveis, licenças suspensas e trials expirando"
        actions={<AdminButtonGhost onClick={() => void refetch()}>Atualizar</AdminButtonGhost>}
      />
      <div className="space-y-2.5 p-5">
        {alerts.length === 0 ? (
          <div className="rounded-[10px] border border-[#1a5040] bg-[#0d1a15] p-4 text-sm text-[#4ecb8d]">
            Nenhum alerta no momento — tudo certo.
          </div>
        ) : (
          alerts.map((a, i) => {
            const Icon = ICON[a.type];
            return (
              <Link
                key={`${a.clientId}-${a.type}-${i}`}
                href={`/admin/clients/${a.clientId}`}
                className="flex items-center gap-3 rounded-[10px] border border-[#1e2130] bg-[#13161f] p-3.5 transition-colors hover:bg-[#171b28]"
              >
                <Icon className={`h-4 w-4 shrink-0 ${COLOR[a.type]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#c0c8e8]">{a.clientName}</p>
                  <p className="text-xs text-[#4a5070]">{a.message}</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#3a4060]" />
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}
