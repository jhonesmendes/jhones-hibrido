"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  Building2,
  ChevronDown,
  Clock,
  Coins,
  ExternalLink,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { AdminTopbar, AdminButtonGhost, AdminButtonPrimary } from "@/components/admin/admin-topbar";
import { KpiCard } from "@/components/admin/kpi-card";
import { ClientCostSection } from "@/components/admin/client-cost-section";

type ClientRow = {
  id: string;
  name: string;
  baseUrl: string;
  contactWhatsapp: string | null;
  contactEmail: string | null;
  reachable: boolean;
  license: {
    type: string;
    status: string;
    maxAgents: number;
    addonAgents: number;
    trialEndsAt: string | null;
  } | null;
  usage: { maxAgents: number } | null;
  costBrl30d: number | null;
};

type ClientDetail = {
  client: { id: string; name: string; baseUrl: string };
  license: Record<string, unknown> | null;
  usage: {
    maxOfficialNumbers: number;
    maxWebNumbers: number;
    maxDepartments: number;
    maxAdmins: number;
    maxAgents: number;
  } | null;
};

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PLAN_LABEL: Record<string, string> = {
  trial: "Trial",
  starter: "Starter",
  business: "Business",
  enterprise: "Enterprise",
};

const PLAN_BADGE: Record<string, string> = {
  trial: "bg-[#1a2040] text-[#5878d0]",
  starter: "bg-[#1a3020] text-[#4a9060]",
  business: "bg-[#2a2040] text-[#9070e0]",
  enterprise: "bg-[#302010] text-[#c08040]",
};

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function agentPct(used: number, max: number): number {
  return max > 0 ? Math.round((used / max) * 100) : 0;
}

function barColor(pct: number): string {
  return pct >= 90 ? "bg-[#7a2020]" : pct >= 70 ? "bg-[#8a5a10]" : "bg-[#2a4090]";
}

export function AdminDashboardClient() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
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

  const filtered = useMemo(() => {
    if (!clients) return [];
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || c.baseUrl.toLowerCase().includes(q)
    );
  }, [clients, query]);

  if (clients === null) {
    return <p className="p-5 text-[#4a5070]">Carregando…</p>;
  }

  const trialCount = clients.filter((c) => c.license?.type === "trial").length;
  const expiringCount = clients.filter(
    (c) => c.license?.trialEndsAt && daysUntil(c.license.trialEndsAt) <= 3 && daysUntil(c.license.trialEndsAt) >= 0
  ).length;
  const totalCostBrl = clients.reduce((sum, c) => sum + (c.costBrl30d ?? 0), 0);

  return (
    <>
      <AdminTopbar
        title="Instâncias registradas"
        subtitle="Gerencie clientes, planos e custos Meta"
        actions={
          <>
            <AdminButtonGhost onClick={() => void refetch()}>
              <RefreshCw className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> Atualizar
            </AdminButtonGhost>
            <AdminButtonPrimary onClick={() => setCreating((v) => !v)}>
              <Plus className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> Registrar cliente
            </AdminButtonPrimary>
          </>
        }
      />

      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <KpiCard icon={<Building2 className="h-3.5 w-3.5" />} label="Instâncias" value={clients.length} sub="registradas" accent="blue" />
          <KpiCard icon={<Clock className="h-3.5 w-3.5" />} label="Em trial" value={trialCount} sub={clients.find((c) => c.license?.type === "trial")?.name ?? "nenhum"} accent="amber" />
          <KpiCard icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Expirando ≤3d" value={expiringCount} sub={expiringCount > 0 ? "atenção" : "nenhum"} accent={expiringCount > 0 ? "red" : "green"} />
          <KpiCard icon={<Coins className="h-3.5 w-3.5" />} label="Custo Meta 30d" value={fmtBRL(totalCostBrl)} sub="consolidado" accent="blue" />
        </div>

        {creating && (
          <NewClientForm
            onClose={() => setCreating(false)}
            onCreated={() => {
              setCreating(false);
              void refetch();
            }}
          />
        )}

        <div className="overflow-hidden rounded-[10px] border border-[#1e2130] bg-[#13161f]">
          <div className="flex items-center justify-between border-b border-[#1e2130] px-4 py-3">
            <p className="text-[13px] font-medium text-[#c0c8e8]">Clientes</p>
            <div className="flex items-center gap-1.5 rounded-lg border border-[#1e2130] bg-[#0f1117] px-2.5 py-1">
              <Search className="h-3.5 w-3.5 text-[#3a4060]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar cliente…"
                className="w-36 bg-transparent text-xs text-[#8890b0] outline-none placeholder:text-[#3a4060]"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#3a4060]">
              {clients.length === 0 ? "Nenhum cliente registrado ainda." : "Nenhum cliente encontrado."}
            </p>
          ) : (
            filtered.map((c) => (
              <ClientRowItem
                key={c.id}
                client={c}
                open={openId === c.id}
                onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
                onChanged={refetch}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

function ClientRowItem({
  client: c,
  open,
  onToggle,
  onChanged,
}: {
  client: ClientRow;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [suspending, setSuspending] = useState(false);
  const pct = c.usage && c.license ? agentPct(c.usage.maxAgents, c.license.maxAgents + c.license.addonAgents) : 0;

  async function toggleSuspend() {
    setSuspending(true);
    const res = await fetch(`/api/admin/clients/${c.id}`).catch(() => null);
    const detail = (await res?.json().catch(() => null)) as ClientDetail | null;
    if (detail?.license) {
      const nextStatus = detail.license.status === "suspended" ? "active" : "suspended";
      await fetch(`/api/admin/clients/${c.id}/license`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...detail.license, status: nextStatus }),
      }).catch(() => null);
      onChanged();
    }
    setSuspending(false);
  }

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-3 border-b border-[#1a1e2e] px-4 py-2.5 transition-colors hover:bg-[#15192a] ${open ? "bg-[#15192a]" : ""}`}
        onClick={onToggle}
      >
        <div
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: c.reachable ? "#4ecb8d" : "#f07070" }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-[#c0c8e8]">{c.name}</p>
          <p className="truncate text-[11px] text-[#3a4060]">{c.baseUrl}</p>
        </div>
        <div className="w-[90px] shrink-0">
          {c.license && (
            <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${PLAN_BADGE[c.license.type] ?? "bg-[#1a2040] text-[#5878d0]"}`}>
              {PLAN_LABEL[c.license.type] ?? c.license.type}
            </span>
          )}
        </div>
        <div className="w-20 shrink-0 text-right">
          <p className="text-[13px] text-[#8890b0]">
            {c.usage && c.license ? `${c.usage.maxAgents} / ${c.license.maxAgents + c.license.addonAgents}` : "—"}
          </p>
          {c.usage && c.license && (
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#1a1e2e]">
              <div className={`h-full rounded-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <div className="w-[110px] shrink-0 text-right">
          <span className="text-[13px] font-medium text-[#e8eaf2]">
            {c.costBrl30d != null ? fmtBRL(c.costBrl30d) : "—"}
          </span>
        </div>
        <div className="w-[70px] shrink-0 text-right text-xs">
          {!c.reachable ? (
            <span className="text-[#f07070]">Inacessível</span>
          ) : c.license?.status === "active" ? (
            <span className="text-[#4ecb8d]">Ativo</span>
          ) : (
            <span className="text-[#f0b429]">{c.license?.status ?? "—"}</span>
          )}
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[#3a4060] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </div>

      {open && (
        <div className="border-b border-[#1a1e2e] bg-[#0d1020] px-4 py-3.5 pl-9">
          <div className="grid gap-3.5 lg:grid-cols-2">
            <div className="rounded-[10px] border border-[#1e2130] bg-[#13161f] p-3.5">
              <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[#3a4060]">
                <LayoutDashboard className="h-3 w-3" /> Uso atual
              </p>
              <div className="flex items-center justify-between border-b border-[#141826] py-1.5 text-xs">
                <span className="text-[#6070a0]">Agentes</span>
                <span className={pct >= 90 ? "font-medium text-[#f07070]" : pct >= 70 ? "font-medium text-[#f0b429]" : "font-medium text-[#c0c8e8]"}>
                  {c.usage && c.license ? `${c.usage.maxAgents} / ${c.license.maxAgents + c.license.addonAgents}` : "—"}
                </span>
              </div>
              <div className="flex gap-1.5 pt-3">
                <Link
                  href={`/admin/clients/${c.id}`}
                  className="rounded-md border border-[#1e2540] px-2.5 py-1 text-[11px] text-[#7c9ff5] transition-colors hover:bg-[#1e2540]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="mr-1 inline h-3 w-3 align-[-1px]" /> Ver detalhes completos
                </Link>
                <button
                  disabled={suspending || !c.license}
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleSuspend();
                  }}
                  className="rounded-md border border-[#3a2020] px-2.5 py-1 text-[11px] text-[#f07070] transition-colors hover:bg-[#2a1818] disabled:opacity-50"
                >
                  <Ban className="mr-1 inline h-3 w-3 align-[-1px]" />
                  {c.license?.status === "suspended" ? "Reativar" : "Suspender"}
                </button>
              </div>
            </div>

            <div className="rounded-[10px] border border-[#1e2130] bg-[#13161f] p-3.5">
              <ClientCostSection clientId={c.id} compact />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewClientForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  async function create() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        baseUrl,
        contactWhatsapp: contactWhatsapp || undefined,
        contactEmail: contactEmail || undefined,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(data?.error?.message ?? "Não foi possível registrar o cliente");
      return;
    }
    const data = (await res.json()) as { internalSecret: string };
    setSecret(data.internalSecret);
  }

  if (secret) {
    return (
      <div className="space-y-3 rounded-[10px] border border-[#1a5040] bg-[#0d1a15] p-4">
        <p className="font-medium text-[#4ecb8d]">Cliente registrado.</p>
        <p className="text-sm text-[#8890b0]">
          Cole isto na variável <code className="rounded bg-black/30 px-1">LICENSE_CONTROL_SECRET</code>{" "}
          da instância desse cliente — só aparece esta vez:
        </p>
        <code className="block break-all rounded bg-black/40 p-2 text-xs text-[#c0c8e8]">{secret}</code>
        <AdminButtonPrimary onClick={onCreated}>Fechar</AdminButtonPrimary>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-[10px] border border-[#1e2130] bg-[#13161f] p-4">
      <div className="space-y-1">
        <label className="text-sm text-[#8890b0]">Nome do cliente</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-[#1e2130] bg-[#0f1117] px-3 py-2 text-sm text-[#c0c8e8] outline-none focus:border-[#2a4090]"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm text-[#8890b0]">URL base da instância (https://cliente.dominio.com)</label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://cliente.vocero.com.br"
          className="w-full rounded-md border border-[#1e2130] bg-[#0f1117] px-3 py-2 text-sm text-[#c0c8e8] outline-none focus:border-[#2a4090]"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm text-[#8890b0]">WhatsApp de contato (opcional)</label>
          <input
            value={contactWhatsapp}
            onChange={(e) => setContactWhatsapp(e.target.value)}
            placeholder="5511999999999"
            className="w-full rounded-md border border-[#1e2130] bg-[#0f1117] px-3 py-2 text-sm text-[#c0c8e8] outline-none focus:border-[#2a4090]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-[#8890b0]">E-mail de contato (opcional)</label>
          <input
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="w-full rounded-md border border-[#1e2130] bg-[#0f1117] px-3 py-2 text-sm text-[#c0c8e8] outline-none focus:border-[#2a4090]"
          />
        </div>
      </div>
      {error && <p className="text-sm text-[#f07070]">{error}</p>}
      <div className="flex gap-2">
        <AdminButtonPrimary disabled={saving || !name.trim() || !baseUrl.trim()} onClick={() => void create()}>
          {saving ? "Registrando…" : "Registrar"}
        </AdminButtonPrimary>
        <AdminButtonGhost onClick={onClose}>Cancelar</AdminButtonGhost>
      </div>
    </div>
  );
}
