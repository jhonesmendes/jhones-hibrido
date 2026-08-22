"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ApiKeyRow = {
  id: string;
  name: string;
  tokenLast4: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function IntegrationsClient() {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/integrations").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { keys: ApiKeyRow[] };
    setKeys(data.keys);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function create() {
    setCreating(true);
    setError(null);
    const res = await fetch("/api/settings/integrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    }).catch(() => null);
    setCreating(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(data?.error?.message ?? "Não foi possível criar a chave");
      return;
    }
    const data = (await res.json()) as { token: string };
    setNewToken(data.token);
    setName("");
    void refetch();
  }

  async function revoke(id: string) {
    if (!confirm("Revogar esta chave? A integração que a usa para de funcionar imediatamente.")) return;
    await fetch(`/api/settings/integrations/${id}`, { method: "DELETE" }).catch(() => null);
    void refetch();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Integrações externas</CardTitle>
          <CardDescription>
            Chaves de API para sistemas externos (ERP, N8N, automações) enviarem mensagens WhatsApp
            por esta instância via <code className="rounded bg-secondary/50 px-1">POST /api/internal/send-message</code>{" "}
            — cada integração com a própria chave, revogável sem afetar as outras.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {newToken && (
            <div className="space-y-2 rounded-md border border-success/30 bg-success/10 p-3">
              <p className="text-sm font-medium text-success">Chave criada.</p>
              <p className="text-xs text-muted-foreground">
                Copie o token abaixo e cole na integração (header <code>x-internal-key</code>) — ele
                só aparece esta vez.
              </p>
              <code className="block break-all rounded bg-background/60 p-2 text-xs">{newToken}</code>
              <Button size="sm" variant="outline" onClick={() => setNewToken(null)}>
                Fechar
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="integration-name">Nome da integração</Label>
              <Input
                id="integration-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex.: Sankhya"
                className="w-56"
              />
            </div>
            <Button disabled={creating || !name.trim()} onClick={() => void create()}>
              {creating ? "Criando…" : "Nova chave"}
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="space-y-2">
        {keys === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {keys?.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma chave criada ainda.</p>
        )}
        {keys?.map((k) => (
          <div
            key={k.id}
            className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm"
          >
            <div>
              <p className="font-medium">
                {k.name} <span className="text-muted-foreground">•••• {k.tokenLast4}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Criada em {new Date(k.createdAt).toLocaleDateString("pt-BR")}
                {k.lastUsedAt && ` · último uso ${new Date(k.lastUsedAt).toLocaleString("pt-BR")}`}
                {k.revokedAt && ` · revogada em ${new Date(k.revokedAt).toLocaleDateString("pt-BR")}`}
              </p>
            </div>
            {!k.revokedAt && (
              <Button size="sm" variant="destructive" onClick={() => void revoke(k.id)}>
                Revogar
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
