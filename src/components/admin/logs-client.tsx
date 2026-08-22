"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, ScrollText } from "lucide-react";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { ACTION_LABEL } from "@/components/settings/audit-client";
import { TRACE_LABELS } from "@/lib/trace-labels";

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

type TraceEntry = {
  id: string;
  type: string;
  channel: string | null;
  memberName: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
  conversationId: string | null;
  contactName: string | null;
};

type Tab = "audit" | "trace";

function traceDetailSummary(detail: Record<string, unknown> | null): string | null {
  if (!detail) return null;
  if (typeof detail.textPreview === "string" && detail.textPreview) return `"${detail.textPreview}"`;
  return null;
}

export function AdminLogsClient() {
  const [tab, setTab] = useState<Tab>("audit");
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [clientId, setClientId] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [auditEntries, setAuditEntries] = useState<AuditEntry[] | null>(null);
  const [traceEntries, setTraceEntries] = useState<TraceEntry[] | null>(null);
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

  // Trocar de aba reseta o filtro de tipo (as opções são diferentes) e o
  // resultado — evita mostrar "Ação: campanha.sent" filtrando eventos de
  // rastro técnico, que não tem essa categoria.
  useEffect(() => {
    setTypeFilter("");
    setAuditEntries(null);
    setTraceEntries(null);
    setNextCursor(null);
  }, [tab]);

  const buildParams = useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams();
      if (typeFilter) params.set(tab === "audit" ? "action" : "type", typeFilter);
      if (since) params.set("since", new Date(since).toISOString());
      if (until) params.set("until", new Date(`${until}T23:59:59`).toISOString());
      if (cursor) params.set("cursor", cursor);
      return params;
    },
    [tab, typeFilter, since, until]
  );

  const refetch = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    const path = tab === "audit" ? "logs" : "trace-log";
    const res = await fetch(`/api/admin/clients/${clientId}/${path}?${buildParams().toString()}`).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Não foi possível buscar os logs desta instância");
      setAuditEntries(null);
      setTraceEntries(null);
      return;
    }
    if (tab === "audit") {
      const data = (await res.json()) as { entries: AuditEntry[]; nextCursor: string | null };
      setAuditEntries(data.entries);
      setNextCursor(data.nextCursor);
    } else {
      const data = (await res.json()) as { entries: TraceEntry[]; nextCursor: string | null };
      setTraceEntries(data.entries);
      setNextCursor(data.nextCursor);
    }
  }, [clientId, tab, buildParams]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function loadMore() {
    if (!nextCursor || !clientId) return;
    setLoading(true);
    const path = tab === "audit" ? "logs" : "trace-log";
    const res = await fetch(`/api/admin/clients/${clientId}/${path}?${buildParams(nextCursor).toString()}`).catch(
      () => null
    );
    setLoading(false);
    if (!res?.ok) return;
    if (tab === "audit") {
      const data = (await res.json()) as { entries: AuditEntry[]; nextCursor: string | null };
      setAuditEntries((prev) => [...(prev ?? []), ...data.entries]);
      setNextCursor(data.nextCursor);
    } else {
      const data = (await res.json()) as { entries: TraceEntry[]; nextCursor: string | null };
      setTraceEntries((prev) => [...(prev ?? []), ...data.entries]);
      setNextCursor(data.nextCursor);
    }
  }

  const entries = tab === "audit" ? auditEntries : traceEntries;
  const typeOptions = tab === "audit" ? ACTION_LABEL : TRACE_LABELS;

  return (
    <>
      <AdminTopbar
        title="Logs"
        subtitle="Auditoria e rastro técnico centralizados — ações críticas e diagnóstico de mensagens, por instância e período"
      />
      <div className="space-y-4 p-5">
        <div className="flex gap-1 border-b border-[#1e2130]">
          <button
            onClick={() => setTab("audit")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors ${
              tab === "audit" ? "border-[#7c9ff5] text-[#7c9ff5]" : "border-transparent text-[#4a5070] hover:text-[#8890b0]"
            }`}
          >
            <ScrollText className="h-3.5 w-3.5" /> Auditoria
          </button>
          <button
            onClick={() => setTab("trace")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors ${
              tab === "trace" ? "border-[#7c9ff5] text-[#7c9ff5]" : "border-transparent text-[#4a5070] hover:text-[#8890b0]"
            }`}
          >
            <Activity className="h-3.5 w-3.5" /> Diagnóstico técnico
          </button>
        </div>

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
            <label className="text-[11px] text-[#4a5070]">{tab === "audit" ? "Ação" : "Tipo de evento"}</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-8 w-56 rounded-md border border-[#1e2130] bg-[#0f1117] px-2 text-xs text-[#c0c8e8] outline-none focus:border-[#2a4090]"
            >
              <option value="">Todos</option>
              {Object.entries(typeOptions).map(([key, label]) => (
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
          ) : tab === "audit" ? (
            <>
              {(entries as AuditEntry[]).map((e) => (
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
            </>
          ) : (
            <>
              {(entries as TraceEntry[]).map((e) => {
                const summary = traceDetailSummary(e.detail);
                return (
                  <div key={e.id} className="border-b border-[#1a1e2e] px-4 py-2.5 text-sm last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#c0c8e8]">{TRACE_LABELS[e.type] ?? e.type}</span>
                      <span className="text-xs text-[#4a5070]">{new Date(e.createdAt).toLocaleString("pt-BR")}</span>
                    </div>
                    <p className="text-xs text-[#4a5070]">
                      {e.contactName ?? "contato removido"}
                      {e.memberName && ` · ${e.memberName}`}
                      {e.channel && ` · ${e.channel === "official" ? "oficial" : "WhatsApp Web"}`}
                    </p>
                    {summary && <p className="mt-0.5 truncate text-xs text-[#4a5070]">{summary}</p>}
                  </div>
                );
              })}
            </>
          )}
          {entries && entries.length > 0 && nextCursor && (
            <button
              disabled={loading}
              onClick={() => void loadMore()}
              className="w-full border-t border-[#1a1e2e] py-2.5 text-xs text-[#7c9ff5] hover:bg-[#1a1e2e] disabled:opacity-50"
            >
              {loading ? "Carregando…" : "Carregar mais"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
