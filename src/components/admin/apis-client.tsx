"use client";

import { useCallback, useEffect, useState } from "react";
import { Plug } from "lucide-react";
import { AdminTopbar } from "@/components/admin/admin-topbar";

type ClientRow = { id: string; name: string };

type ApiKeyRow = {
  id: string;
  name: string;
  tokenLast4: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function AdminApisClient() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [clientId, setClientId] = useState("");
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  const refetch = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/clients/${clientId}/api-keys`).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Não foi possível buscar as integrações desta instância");
      setKeys(null);
      return;
    }
    const data = (await res.json()) as { keys: ApiKeyRow[] };
    setKeys(data.keys);
  }, [clientId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return (
    <>
      <AdminTopbar
        title="APIs"
        subtitle="Chaves de integração externa (ERP, N8N, automações) por instância"
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
          <p className="text-xs text-[#4a5070]">
            Só leitura — a chave de verdade é criada e revogada em Configurações → Integrações,
            dentro da própria instância.
          </p>
        </div>

        {error && (
          <div className="rounded-[10px] border border-[#3a2020] bg-[#2a1818] p-3 text-sm text-[#f0a0a0]">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-[10px] border border-[#1e2130] bg-[#13161f]">
          <div className="border-b border-[#1e2130] px-4 py-3">
            <p className="text-[13px] font-medium text-[#c0c8e8]">Chaves registradas</p>
          </div>
          {keys === null || keys.length === 0 ? (
            <p className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-[#3a4060]">
              <Plug className="h-5 w-5" />
              {loading ? "Carregando…" : "Nenhuma chave criada nesta instância ainda."}
            </p>
          ) : (
            keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between border-b border-[#1a1e2e] px-4 py-2.5 text-sm last:border-0">
                <div>
                  <p className="font-medium text-[#c0c8e8]">
                    {k.name} <span className="text-[#4a5070]">•••• {k.tokenLast4}</span>
                  </p>
                  <p className="text-xs text-[#4a5070]">
                    Criada em {new Date(k.createdAt).toLocaleDateString("pt-BR")}
                    {k.lastUsedAt && ` · último uso ${new Date(k.lastUsedAt).toLocaleString("pt-BR")}`}
                  </p>
                </div>
                {k.revokedAt ? (
                  <span className="text-xs text-[#f07070]">Revogada</span>
                ) : (
                  <span className="text-xs text-[#4ecb8d]">Ativa</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
