"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

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

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PLAN_LABEL: Record<string, string> = {
  trial: "Trial",
  starter: "Starter",
  business: "Business",
  enterprise: "Enterprise",
};

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function AdminDashboardClient() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [creating, setCreating] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/admin/clients").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { clients: ClientRow[] };
    setClients(data.clients);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (clients === null) {
    return <p className="text-white/60">Carregando…</p>;
  }

  const trialCount = clients.filter((c) => c.license?.type === "trial").length;
  const expiringCount = clients.filter(
    (c) => c.license?.trialEndsAt && daysUntil(c.license.trialEndsAt) <= 3 && daysUntil(c.license.trialEndsAt) >= 0
  ).length;
  const totalCostBrl = clients.reduce((sum, c) => sum + (c.costBrl30d ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="rounded-lg border border-white/10 px-4 py-3">
          <p className="text-2xl font-bold">{clients.length}</p>
          <p className="text-white/50">Instâncias registradas</p>
        </div>
        <div className="rounded-lg border border-white/10 px-4 py-3">
          <p className="text-2xl font-bold">{trialCount}</p>
          <p className="text-white/50">Em trial</p>
        </div>
        <div className="rounded-lg border border-white/10 px-4 py-3">
          <p className={`text-2xl font-bold ${expiringCount > 0 ? "text-amber-400" : ""}`}>
            {expiringCount}
          </p>
          <p className="text-white/50">Trial expirando em ≤3 dias</p>
        </div>
        <div className="rounded-lg border border-white/10 px-4 py-3">
          <p className="text-2xl font-bold">{fmtBRL(totalCostBrl)}</p>
          <p className="text-white/50">Custo Meta consolidado (30 dias)</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-white/60">
            <tr>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Plano</th>
              <th className="px-4 py-2">Agentes</th>
              <th className="px-4 py-2">Custo Meta (30d)</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t border-white/10">
                <td className="px-4 py-2">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-white/40">{c.baseUrl}</p>
                </td>
                <td className="px-4 py-2">
                  {c.license ? PLAN_LABEL[c.license.type] ?? c.license.type : "—"}
                </td>
                <td className="px-4 py-2">
                  {c.usage && c.license
                    ? `${c.usage.maxAgents} / ${c.license.maxAgents + c.license.addonAgents}`
                    : "—"}
                </td>
                <td className="px-4 py-2">{c.costBrl30d != null ? fmtBRL(c.costBrl30d) : "—"}</td>
                <td className="px-4 py-2">
                  {!c.reachable ? (
                    <span className="text-red-400">Inacessível</span>
                  ) : c.license?.status === "active" ? (
                    <span className="text-emerald-400">Ativo</span>
                  ) : (
                    <span className="text-amber-400">{c.license?.status ?? "—"}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/admin/clients/${c.id}`} className="text-sm text-brand hover:underline">
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-white/40">
                  Nenhum cliente registrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating ? (
        <NewClientForm
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void refetch();
          }}
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + Registrar cliente novo
        </button>
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
      <div className="max-w-lg space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
        <p className="font-medium text-emerald-300">Cliente registrado.</p>
        <p className="text-sm text-white/70">
          Cole isto na variável <code className="rounded bg-black/30 px-1">LICENSE_CONTROL_SECRET</code>{" "}
          da instância desse cliente — só aparece esta vez:
        </p>
        <code className="block break-all rounded bg-black/40 p-2 text-xs">{secret}</code>
        <button
          onClick={onCreated}
          className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:opacity-90"
        >
          Fechar
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-3 rounded-lg border border-white/10 p-4">
      <div className="space-y-1">
        <label className="text-sm text-white/70">Nome do cliente</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm text-white/70">URL base da instância (https://cliente.dominio.com)</label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://cliente.vocero.com.br"
          className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm text-white/70">WhatsApp de contato (opcional)</label>
          <input
            value={contactWhatsapp}
            onChange={(e) => setContactWhatsapp(e.target.value)}
            placeholder="5511999999999"
            className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-white/70">E-mail de contato (opcional)</label>
          <input
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          disabled={saving || !name.trim() || !baseUrl.trim()}
          onClick={() => void create()}
          className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Registrando…" : "Registrar"}
        </button>
        <button onClick={onClose} className="rounded-md border border-white/15 px-3 py-1.5 text-sm">
          Cancelar
        </button>
      </div>
    </div>
  );
}
