"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClientBackupSection } from "@/components/admin/client-backup-section";
import { ClientCostSection } from "@/components/admin/client-cost-section";
import { AdminTopbar } from "@/components/admin/admin-topbar";

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
    <div className="flex items-center justify-between border-b border-[#141826] py-2 text-sm last:border-0">
      <span className="text-[#6070a0]">{label}</span>
      <span className="text-[#c0c8e8]">
        {current} / {unlimited ? "∞" : limit}
      </span>
    </div>
  );
}

export function ClientDetailClient({ clientId }: { clientId: string }) {
  const router = useRouter();
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

  async function removeClient() {
    if (!detail) return;
    if (!confirm(`Remover "${detail.client.name}" do painel? Isso não afeta a instância do cliente, só o registro aqui.`)) {
      return;
    }
    const res = await fetch(`/api/admin/clients/${clientId}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) router.push("/admin");
  }

  if (!detail) return <p className="p-5 text-[#4a5070]">Carregando…</p>;

  return (
    <>
      <AdminTopbar
        title={detail.client.name}
        subtitle={`Instâncias → ${detail.client.name}`}
      />
      <div className="max-w-2xl space-y-5 p-5">
        <Link href="/admin" className="text-sm text-[#7c9ff5] hover:underline">
          ← Voltar
        </Link>

        <p className="text-sm text-[#4a5070]">{detail.client.baseUrl}</p>

        {!detail.reachable && (
          <p className="rounded-md border border-[#3a2020] bg-[#2a1818] p-3 text-sm text-[#f0a0a0]">
            Instância inacessível{detail.fetchError ? `: ${detail.fetchError}` : ""} — as mudanças
            abaixo não vão aplicar até ela responder.
          </p>
        )}

        {detail.usage && detail.license && (
          <div className="rounded-[10px] border border-[#1e2130] bg-[#13161f] p-4">
            <p className="mb-2 text-sm font-medium text-[#c0c8e8]">Uso atual</p>
            <UsageRow label="Agentes" current={detail.usage.maxAgents} limit={detail.license.maxAgents + detail.license.addonAgents} />
            <UsageRow label="Administradores" current={detail.usage.maxAdmins} limit={detail.license.maxAdmins} />
            <UsageRow label="Números oficiais" current={detail.usage.maxOfficialNumbers} limit={detail.license.maxOfficialNumbers} />
            <UsageRow label="Números WhatsApp Web" current={detail.usage.maxWebNumbers} limit={detail.license.maxWebNumbers} />
            <UsageRow label="Departamentos" current={detail.usage.maxDepartments} limit={detail.license.maxDepartments} />
          </div>
        )}

        <div className="space-y-4 rounded-[10px] border border-[#1e2130] bg-[#13161f] p-4">
          <p className="text-sm font-medium text-[#c0c8e8]">Plano</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PLAN_LABEL) as LicenseType[]).map((p) => (
              <button
                key={p}
                onClick={() => setPlan(p)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  plan === p
                    ? "border-[#2a3560] bg-[#1e2540] text-[#7c9ff5]"
                    : "border-[#1e2130] text-[#8890b0] hover:bg-[#1a1e2e]"
                }`}
              >
                {PLAN_LABEL[p]}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-sm text-[#8890b0]">Add-on de agentes (além do plano base)</label>
            <input
              type="number"
              min={0}
              max={500}
              value={addonAgents}
              onChange={(e) => setAddonAgents(Number(e.target.value) || 0)}
              className="w-32 rounded-md border border-[#1e2130] bg-[#0f1117] px-3 py-2 text-sm text-[#c0c8e8] outline-none focus:border-[#2a4090]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-[#8890b0]">
              {plan === "trial" ? "Trial expira em" : "Vencimento (vazio = sem vencimento)"}
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full rounded-md border border-[#1e2130] bg-[#0f1117] px-3 py-2 text-sm text-[#c0c8e8] outline-none focus:border-[#2a4090]"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStatus(status === "suspended" ? "active" : "suspended")}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                status === "suspended"
                  ? "border-[#3a2020] text-[#f07070] hover:bg-[#2a1818]"
                  : "border-[#1e2130] text-[#8890b0] hover:bg-[#1a1e2e]"
              }`}
            >
              {status === "suspended" ? "Suspenso — clique para reativar" : "Suspender instância"}
            </button>
          </div>

          {error && <p className="text-sm text-[#f07070]">{error}</p>}
          {savedMsg && <p className="text-sm text-[#4ecb8d]">{savedMsg}</p>}
          <button
            disabled={saving}
            onClick={() => void saveLicense()}
            className="rounded-md border border-[#2a4090] bg-[#1e3080] px-4 py-2 text-sm font-medium text-[#7c9ff5] transition-colors hover:bg-[#243898] disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar plano"}
          </button>
        </div>

        <ClientBackupSection clientId={clientId} clientName={detail.client.name} />

        <ClientCostSection clientId={clientId} />

        <button
          onClick={() => void removeClient()}
          className="text-sm text-[#f07070] hover:underline"
        >
          Remover cliente do painel
        </button>
      </div>
    </>
  );
}
