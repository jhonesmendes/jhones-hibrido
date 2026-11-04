"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type InboundState = {
  webhook: { url: string | null; hasToken: boolean };
  queue: { pending: number; failed: number; lastError: string | null };
};

/**
 * Webhook do n8n que recebe cada mensagem recebida. Ligado, o workflow passa
 * a responder as conversas e o agente de IA do Vocero fica calado.
 */
export function N8nInboundCard() {
  const [state, setState] = useState<InboundState | null>(null);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/n8n/inbound").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as InboundState;
    setState(data);
    setUrl(data.webhook.url ?? "");
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function save(nextUrl: string | null) {
    setSaving(true);
    setResult(null);
    const res = await fetch("/api/settings/n8n/inbound", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: nextUrl, token: token.trim() || undefined }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setResult({ ok: false, message: data?.error?.message ?? "Não foi possível salvar" });
      return;
    }
    setToken("");
    setResult({ ok: true, message: nextUrl ? "Webhook salvo." : "Webhook desligado." });
    void refetch();
  }

  async function test() {
    setTesting(true);
    setResult(null);
    const res = await fetch("/api/settings/n8n/inbound/test", { method: "POST" }).catch(() => null);
    setTesting(false);
    if (res?.ok) {
      setResult({ ok: true, message: "O n8n recebeu o evento de teste." });
      return;
    }
    const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
    setResult({ ok: false, message: data?.error?.message ?? "O webhook não respondeu" });
  }

  if (!state) return null;
  const savedUrl = state.webhook.url;

  return (
    <div className="mb-6 space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold">Receber mensagens no n8n</h3>
        <p className="text-xs text-muted-foreground">
          Cada mensagem recebida é gravada aqui e enviada a este webhook. Ligado, o workflow responde
          as conversas e o agente de IA do Vocero fica calado.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="n8n-inbound-url">URL do webhook (produção)</Label>
          <Input
            id="n8n-inbound-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://n8n.exemplo.com/webhook/vocero"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="n8n-inbound-token">Token (header x-vocero-token)</Label>
          <Input
            id="n8n-inbound-token"
            type="password"
            autoComplete="new-password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={state.webhook.hasToken ? "•••••••• (mantido se vazio)" : "Opcional"}
          />
        </div>
      </div>
      {(state.queue.pending > 0 || state.queue.failed > 0) && (
        <p className="text-xs text-muted-foreground">
          {state.queue.pending} aguardando entrega · {state.queue.failed} sem entrega após todas as
          tentativas
          {state.queue.lastError ? ` · último erro: ${state.queue.lastError}` : ""}
        </p>
      )}
      {result && (
        <p className={`text-sm ${result.ok ? "text-brand-text" : "text-destructive"}`}>
          {result.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={saving || !url.trim()} onClick={() => void save(url.trim())}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={testing || !savedUrl}
          onClick={() => void test()}
        >
          {testing ? "Testando…" : "Enviar teste"}
        </Button>
        {savedUrl && (
          <Button size="sm" variant="ghost" disabled={saving} onClick={() => void save(null)}>
            Desligar
          </Button>
        )}
      </div>
    </div>
  );
}
