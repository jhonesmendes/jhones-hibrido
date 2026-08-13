"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type LicenseType = "trial" | "starter" | "business" | "enterprise";
type LicenseStatus = "active" | "expired" | "suspended";

type Detail = {
  client: {
    id: string;
    name: string;
    baseUrl: string;
    contactWhatsapp: string | null;
    contactEmail: string | null;
    notes: string | null;
  };
  reachable: boolean;
  fetchError: string | null;
  license: {
    type: LicenseType;
    status: LicenseStatus;
    maxOfficialNumbers: number;
    maxWebNumbers: number;
    maxDepartments: number;
    maxAdmins: number;
    maxAgents: number;
    addonAgents: number;
    expiresAt: string | null;
    trialEndsAt: string | null;
  } | null;
  usage: {
    maxOfficialNumbers: number;
    maxWebNumbers: number;
    maxDepartments: number;
    maxAdmins: number;
    maxAgents: number;
  } | null;
};

const PLAN_LABEL: Record<LicenseType, string> = {
  trial: "Trial",
  starter: "Starter",
  business: "Business",
  enterprise: "Enterprise",
};

function UsageRow({ label, current, limit }: { label: string; current: number; limit: number }) {
  const unlimited = limit >= 9999;
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-2 text-sm">
      <span className="text-white/70">{label}</span>
      <span>
        {current} / {unlimited ? "∞" : limit}
      </span>
    </div>
  );
}

export function ClientDetailClient({ clientId }: { clientId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [plan, setPlan] = useState<LicenseType>("trial");
  const [status, setStatus] = useState<LicenseStatus>("active");
  const [addonAgents, setAddonAgents] = useState(0);
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/admin/clients/${clientId}`).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as Detail;
    setDetail(data);
    if (data.license) {
      setPlan(data.license.type);
      setStatus(data.license.status);
      setAddonAgents(data.license.addonAgents);
      setExpiresAt(data.license.expiresAt ? data.license.expiresAt.slice(0, 10) : "");
    }
  }, [clientId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function saveLicense() {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    const res = await fetch(`/api/admin/clients/${clientId}/license`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: plan,
        status,
        addonAgents,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        trialEndsAt: plan === "trial" ? (expiresAt ? new Date(expiresAt).toISOString() : null) : null,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(data?.error?.message ?? "Não foi possível salvar");
      return;
    }
    setSavedMsg("Salvo — a instância já reflete o novo plano.");
    void refetch();
  }

  if (!detail) return <p className="text-white/60">Carregando…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/admin" className="text-sm text-white/50 hover:underline">
        ← Voltar
      </Link>

      <div>
        <h1 className="text-xl font-bold">{detail.client.name}</h1>
        <p className="text-sm text-white/50">{detail.client.baseUrl}</p>
      </div>

      {!detail.reachable && (
        <p className="rounded-md bg-red-500/10 p-3 text-sm text-red-300">
          Instância inacessível{detail.fetchError ? `: ${detail.fetchError}` : ""} — as mudanças
          abaixo não vão aplicar até ela responder.
        </p>
      )}

      {detail.usage && detail.license && (
        <div className="rounded-lg border border-white/10 p-4">
          <p className="mb-2 text-sm font-medium text-white/70">Uso atual</p>
          <UsageRow label="Agentes" current={detail.usage.maxAgents} limit={detail.license.maxAgents + detail.license.addonAgents} />
          <UsageRow label="Administradores" current={detail.usage.maxAdmins} limit={detail.license.maxAdmins} />
          <UsageRow label="Números oficiais" current={detail.usage.maxOfficialNumbers} limit={detail.license.maxOfficialNumbers} />
          <UsageRow label="Números WhatsApp Web" current={detail.usage.maxWebNumbers} limit={detail.license.maxWebNumbers} />
          <UsageRow label="Departamentos" current={detail.usage.maxDepartments} limit={detail.license.maxDepartments} />
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-white/10 p-4">
        <p className="text-sm font-medium text-white/70">Plano</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PLAN_LABEL) as LicenseType[]).map((p) => (
            <button
              key={p}
              onClick={() => setPlan(p)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                plan === p ? "border-brand bg-brand/20 text-brand" : "border-white/15 text-white/70"
              }`}
            >
              {PLAN_LABEL[p]}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          <label className="text-sm text-white/70">Add-on de agentes (além do plano base)</label>
          <input
            type="number"
            min={0}
            max={500}
            value={addonAgents}
            onChange={(e) => setAddonAgents(Number(e.target.value) || 0)}
            className="w-32 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-white/70">
            {plan === "trial" ? "Trial expira em" : "Vencimento (vazio = sem vencimento)"}
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setStatus(status === "suspended" ? "active" : "suspended")}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              status === "suspended" ? "border-red-400 text-red-300" : "border-white/15 text-white/70"
            }`}
          >
            {status === "suspended" ? "Suspenso — clique para reativar" : "Suspender instância"}
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {savedMsg && <p className="text-sm text-emerald-400">{savedMsg}</p>}
        <button
          disabled={saving}
          onClick={() => void saveLicense()}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar plano"}
        </button>
      </div>
    </div>
  );
}
