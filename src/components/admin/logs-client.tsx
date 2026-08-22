"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { ACTION_LABEL } from "@/components/settings/audit-client";

type ClientRow = { id: string; name: string; reachable: boolean };

type AuditEntry = {
  id: string;
  memberId: string | null;
  memberName: string | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  createdAt: string;
};

export function AdminLogsClient() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [clientId, setClientId] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/clients")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { clients: ClientRow[] } | null) => {
        if (!d) return;
        setClients(d.clients);
        if (d.clients[0]) setClientId(d.clients[0].id);
      })
      .catch(() => {});
  }, []);

  const buildParams = useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams();
      if (actionFilter) params.set("action", actionFilter);
      if (since) params.set("since", new Date(since).toISOString());
      if (until) params.set("until", new Date(`${until}T23:59:59`).toISOString());
      if (cursor) params.set("cursor", cursor);
      return params;
    },
    [actionFilter, since, until]
  );

  const refetch = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/clients/${clientId}/logs?${buildParams().toString()}`).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Não foi possível buscar os logs desta instância");
      setEntries(null);
      return;
    }
    const data = (await res.json()) as { entries: AuditEntry[]; nextCursor: string | null };
    setEntries(data.entries);
    setNextCursor(data.nextCursor);
  }, [clientId, buildParams]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function loadMore() {
    if (!nextCursor || !clientId) return;
    setLoading(true);
    const res = await fetch(`/api/admin/clients/${clientId}/logs?${buildParams(nextCursor).toString()}`).catch(
      () => null
    );
    setLoading(false);
    if (!res?.ok) return;
    const data = (await res.json()) as { entries: AuditEntry[]; nextCursor: string | null };
    setEntries((prev) => [...(prev ?? []), ...data.entries]);
    setNextCursor(data.nextCursor);
  }

  return (
    <>
      <AdminTopbar
        title="Logs"
        subtitle="Auditoria centralizada — ações críticas de cada instância, por período"
      />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3 rounded-[10px] border border-[#1e2130] bg-[#13161f] p-4">
          <div className="space-y-1">
            <label className="text-[11px] text-[#4a5070]">Instância</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="h-8 w-48 rounded-md border border-[#1e2130] bg-[#0f1117] px-2 text-xs text-[#c0c8e8] outline-none focus:border-[#2a4090]"
            >
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-[#4a5070]">Ação</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="h-8 w-52 rounded-md border border-[#1e2130] bg-[#0f1117] px-2 text-xs text-[#c0c8e8] outline-none focus:border-[#2a4090]"
            >
              <option value="">Todas</option>
              {Object.entries(ACTION_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-[#4a5070]">De</label>
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="h-8 rounded-md border border-[#1e2130] bg-[#0f1117] px-2 text-xs text-[#c0c8e8] outline-none focus:border-[#2a4090]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-[#4a5070]">Até</label>
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="h-8 rounded-md border border-[#1e2130] bg-[#0f1117] px-2 text-xs text-[#c0c8e8] outline-none focus:border-[#2a4090]"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-[10px] border border-[#3a2020] bg-[#2a1818] p-3 text-sm text-[#f0a0a0]">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-[10px] border border-[#1e2130] bg-[#13161f]">
          <div className="border-b border-[#1e2130] px-4 py-3">
            <p className="text-[13px] font-medium text-[#c0c8e8]">Eventos</p>
          </div>
          {entries === null || entries.length === 0 ? (
            <p className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-[#3a4060]">
              <ScrollText className="h-5 w-5" />
              {loading ? "Carregando…" : "Nenhum registro no período."}
            </p>
          ) : (
            <>
              {entries.map((e) => (
                <div key={e.id} className="border-b border-[#1a1e2e] px-4 py-2.5 text-sm last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#c0c8e8]">{ACTION_LABEL[e.action] ?? e.action}</span>
                    <span className="text-xs text-[#4a5070]">{new Date(e.createdAt).toLocaleString("pt-BR")}</span>
                  </div>
                  <p className="text-xs text-[#4a5070]">
                    {e.memberName ?? "sistema"}
                    {e.resource && ` · ${e.resource}${e.resourceId ? ` (${e.resourceId})` : ""}`}
                    {e.ipAddress && ` · ${e.ipAddress}`}
                  </p>
                </div>
              ))}
              {nextCursor && (
                <button
                  disabled={loading}
                  onClick={() => void loadMore()}
                  className="w-full border-t border-[#1a1e2e] py-2.5 text-xs text-[#7c9ff5] hover:bg-[#1a1e2e] disabled:opacity-50"
                >
                  {loading ? "Carregando…" : "Carregar mais"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
