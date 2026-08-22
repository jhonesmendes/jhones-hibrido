"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Coins,
  Receipt,
  Settings,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: "instances" | "alerts";
};

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Geral",
    items: [
      { href: "/admin", label: "Instâncias", icon: Building2, badge: "instances" },
      { href: "/admin/costs", label: "Custos Meta", icon: BarChart3 },
      { href: "/admin/licenses", label: "Licenças", icon: Receipt },
    ],
  },
  {
    section: "Sistema",
    items: [
      { href: "/admin/pricing", label: "Tabela de preços", icon: Coins },
      { href: "/admin/alerts", label: "Alertas", icon: AlertTriangle, badge: "alerts" },
      { href: "/admin/settings", label: "Configurações", icon: Settings },
    ],
  },
];

type ClientRow = {
  reachable: boolean;
  license: { status: string; trialEndsAt: string | null } | null;
};

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/** Conta pros badges da sidebar — busca a mesma lista que a página de
 * Instâncias já usa (best-effort: se falhar, os badges só ficam vazios). */
function useSidebarCounts() {
  const [instances, setInstances] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<number | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/admin/clients").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { clients: ClientRow[] };
    setInstances(data.clients.length);
    const alertCount = data.clients.filter(
      (c) =>
        !c.reachable ||
        c.license?.status === "suspended" ||
        (c.license?.trialEndsAt && daysUntil(c.license.trialEndsAt) <= 3 && daysUntil(c.license.trialEndsAt) >= 0)
    ).length;
    setAlerts(alertCount);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { instances, alerts };
}

export function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const { instances, alerts } = useSidebarCounts();

  const initials = email
    .split("@")[0]!
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex w-[200px] shrink-0 flex-col border-r border-[#1e2130] bg-[#13161f]">
      <div className="border-b border-[#1e2130] px-4 pb-3.5 pt-4.5">
        <p className="text-[15px] font-medium tracking-tight text-[#e8eaf2]">Vocero Admin</p>
        <p className="mt-0.5 text-[11px] text-[#4a5070]">Painel central</p>
      </div>

      <nav className="flex-1 px-2 py-2.5">
        {NAV.map((group) => (
          <div key={group.section}>
            <p className="px-2 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-wider text-[#3a4060]">
              {group.section}
            </p>
            {group.items.map((item) => {
              const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              const Icon = item.icon;
              const count = item.badge === "instances" ? instances : item.badge === "alerts" ? alerts : null;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`mb-0.5 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors ${
                    active
                      ? "border-[#2a3560] bg-[#1e2540] text-[#7c9ff5]"
                      : "border-transparent text-[#8890b0] hover:bg-[#1a1e2e] hover:text-[#c0c8e8]"
                  }`}
                >
                  <Icon className="h-[15px] w-[15px]" />
                  <span>{item.label}</span>
                  {count != null && count > 0 && (
                    <span
                      className={`ml-auto rounded-full px-1.5 py-px text-[10px] font-medium ${
                        item.badge === "alerts" ? "bg-[#3a1a1a] text-[#f07070]" : "bg-[#2a3560] text-[#7c9ff5]"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-[#1e2130] p-2">
        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
          <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#1e2540] text-[10px] font-medium text-[#7c9ff5]">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] text-[#4a5070]">{email}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
