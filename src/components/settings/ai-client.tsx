"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Plug, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpLink } from "@/components/docs/help-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AiConfigView = {
  baseUrl: string;
  apiKeyLast4: string | null;
  model: string;
  fallbackModel: string | null;
  temperature: number;
  maxTokens: number;
  contextMessages: number;
  hasApiKey: boolean;
};

const PRESETS = [
  {
    key: "openrouter",
    label: "OpenRouter",
    hint: "Multi-modelo",
    baseUrl: "https://openrouter.ai/api",
    modelExample: "anthropic/claude-sonnet-4.5",
  },
  {
    key: "openai",
    label: "OpenAI",
    hint: "GPT-4o, mini…",
    baseUrl: "https://api.openai.com/v1",
    modelExample: "gpt-4o-mini",
  },
  {
    key: "custom",
    label: "Personalizado",
    hint: "Qualquer endpoint compatível",
    baseUrl: "",
    modelExample: "",
  },
] as const;

const CONTEXT_OPTIONS = [10, 20, 50, 100] as const;

export function AiClient() {
  const [config, setConfig] = useState<AiConfigView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [fallbackModel, setFallbackModel] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(500);
  const [contextMessages, setContextMessages] = useState(20);
  const [testResult, setTestResult] = useState<
    { ok: true } | { ok: false; message: string } | null
  >(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/ai").catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { config: AiConfigView | null };
      setConfig(data.config);
      if (data.config) {
        setBaseUrl(data.config.baseUrl);
        setModel(data.config.model);
        setFallbackModel(data.config.fallbackModel ?? "");
        setTemperature(data.config.temperature);
        setMaxTokens(data.config.maxTokens);
        setContextMessages(data.config.contextMessages);
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!loaded) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  }

  const canTest = baseUrl.trim() && model.trim() && (apiKey.trim() || config?.hasApiKey);

  async function test() {
    setTesting(true);
    setTestResult(null);
    const key = apiKey.trim();
    if (!key) {
      setTesting(false);
      setTestResult({
        ok: false,
        message: "Cole a chave de API para testar (ela não fica salva até você salvar a configuração)",
      });
      return;
    }
    const res = await fetch("/api/settings/ai/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseUrl, apiKey: key, model }),
    }).catch(() => null);
    setTesting(false);
    if (!res) {
      setTestResult({ ok: false, message: "Sem conexão com o servidor" });
      return;
    }
    if (res.ok) {
      setTestResult({ ok: true });
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    setTestResult({ ok: false, message: data?.error?.message ?? "A validação falhou" });
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    const res = await fetch("/api/settings/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        baseUrl,
        apiKey: apiKey.trim() || undefined,
        model,
        fallbackModel: fallbackModel.trim() || null,
        temperature,
        maxTokens,
        contextMessages,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setSaveError(data?.error?.message ?? "Não foi possível salvar");
      return;
    }
    setApiKey("");
    setTestResult(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    void refetch();
  }

  return (
    <div className="max-w-2xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="font-semibold">Inteligência IA</h2>
            <HelpLink slug="inteligencia-ia" />
          </div>
          <p className="text-sm text-muted-foreground">
            Provedor, chave de API e modelo do agente
          </p>
        </div>
        <Badge variant={config?.hasApiKey ? "success" : "secondary"}>
          {config?.hasApiKey ? "IA configurada" : "Usando variáveis de ambiente"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Plug className="h-4 w-4 text-muted-foreground" /> Provedor de IA
          </CardTitle>
          <CardDescription>
            Endpoint compatível com a API de chat completions da OpenAI (Constituição
            II: único adaptador permitido)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setBaseUrl(p.baseUrl);
                  if (p.modelExample && !model) setModel(p.modelExample);
                }}
                className="rounded-md border p-2.5 text-center text-xs transition-colors hover:border-brand-soft hover:bg-brand-tint"
              >
                <div className="font-medium">{p.label}</div>
                <div className="text-muted-foreground">{p.hint}</div>
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-base-url">URL base do provedor</Label>
            <Input
              id="ai-base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://openrouter.ai/api"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Qualquer endpoint compatível com a API OpenAI funciona aqui (com ou
              sem sufixo /v1)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <KeyRound className="h-4 w-4 text-muted-foreground" /> Chave de API
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="ai-api-key">API Key</Label>
              <Input
                id="ai-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                }}
                placeholder={
                  config?.apiKeyLast4
                    ? `Salva (…${config.apiKeyLast4}) — cole uma nova para trocar`
                    : "sk-..."
                }
                className="font-mono text-xs"
              />
            </div>
            <Button
              variant="outline"
              disabled={!canTest || testing}
              onClick={() => void test()}
              className="self-end"
            >
              <Plug className="h-3.5 w-3.5" />
              {testing ? "Testando…" : "Testar"}
            </Button>
          </div>
          {testResult && (
            <p className={`text-sm ${testResult.ok ? "text-success" : "text-destructive"}`}>
              {testResult.ok ? "✓ Conexão bem-sucedida" : testResult.message}
            </p>
          )}
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <KeyRound className="h-3 w-3" /> Armazenada com criptografia AES-256 · nunca
            exposta ao frontend
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Modelo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ai-model">Modelo principal</Label>
              <Input
                id="ai-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="anthropic/claude-sonnet-4.5"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-fallback-model">
                Modelo de fallback <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="ai-fallback-model"
                value={fallbackModel}
                onChange={(e) => setFallbackModel(e.target.value)}
                placeholder="usado também como juiz do Laboratório"
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ai-temperature">Temperatura</Label>
              <Input
                id="ai-temperature"
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
              />
              <p className="text-[11px] text-muted-foreground">0 = preciso · 1 = criativo</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-max-tokens">Máx. tokens resposta</Label>
              <Input
                id="ai-max-tokens"
                type="number"
                min={1}
                max={32000}
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-context">Histórico de contexto</Label>
              <select
                id="ai-context"
                value={contextMessages}
                onChange={(e) => setContextMessages(Number(e.target.value))}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {CONTEXT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} mensagens
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> Salvo
          </span>
        )}
        <Button
          disabled={saving || !baseUrl.trim() || !model.trim() || (!apiKey.trim() && !config?.hasApiKey)}
          onClick={() => void save()}
        >
          <Sparkles className="h-4 w-4" />
          {saving ? "Salvando…" : "Salvar configuração"}
        </Button>
      </div>
    </div>
  );
}
