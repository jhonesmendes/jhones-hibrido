"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  History,
  Play,
  Plug,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type N8nWorkflow = { id: string; name: string; active: boolean; updatedAt: string | null };
type N8nExecution = {
  id: string;
  workflowId: string;
  status: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
};

type WorkflowsResponse = { configured: boolean; workflows: N8nWorkflow[]; error?: string };
type N8nConfigView = { baseUrl: string; apiKeyLast4: string };

export function N8nAutomationsClient() {
  const [loaded, setLoaded] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<N8nWorkflow[]>([]);
  const [executions, setExecutions] = useState<N8nExecution[]>([]);
  const [canConfigure, setCanConfigure] = useState(false);
  const [existingConfig, setExistingConfig] = useState<N8nConfigView | null>(null);
  const [editingConfig, setEditingConfig] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const [wfRes, exRes, cfgRes] = await Promise.all([
      fetch("/api/n8n/workflows").catch(() => null),
      fetch("/api/n8n/executions").catch(() => null),
      fetch("/api/settings/n8n").catch(() => null),
    ]);
    if (wfRes?.ok) {
      const data = (await wfRes.json()) as WorkflowsResponse;
      setConfigured(data.configured);
      setWorkflows(data.workflows);
      setFetchError(data.error ?? null);
    }
    if (exRes?.ok) {
      const data = (await exRes.json()) as { executions: N8nExecution[] };
      setExecutions(data.executions);
    }
    if (cfgRes) {
      setCanConfigure(cfgRes.status !== 403);
      if (cfgRes.ok) {
        const data = (await cfgRes.json()) as { config: N8nConfigView | null };
        setExistingConfig(data.config);
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function execute(workflowId: string) {
    setExecutingId(workflowId);
    await fetch(`/api/n8n/workflows/${workflowId}/execute`, { method: "POST" }).catch(
      () => null
    );
    setExecutingId(null);
    void refetch();
  }

  if (!loaded) {
    return <p className="flex-1 p-6 text-sm text-muted-foreground">Carregando…</p>;
  }

  if (!configured || editingConfig) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        {canConfigure ? (
          <N8nSetupForm
            existing={existingConfig}
            onSaved={() => {
              setEditingConfig(false);
              void refetch();
            }}
            onCancel={configured ? () => setEditingConfig(false) : undefined}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Workflow className="h-8 w-8 text-text-3" strokeWidth={1.3} />
            <p className="text-sm font-medium">N8N ainda não configurado</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Peça a um administrador ou ao proprietário para configurar o N8N em
              Configurações.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4 flex items-center gap-2 rounded-md border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
        <div className="h-2 w-2 shrink-0 rounded-full bg-fill-success" />
        Conectado ao N8N{existingConfig ? ` em ${existingConfig.baseUrl}` : ""} ·{" "}
        {workflows.length} workflow(s) encontrado(s)
        {canConfigure && (
          <button
            type="button"
            className="ml-auto text-primary hover:underline"
            onClick={() => setEditingConfig(true)}
          >
            Editar configuração
          </button>
        )}
      </div>

      {fetchError && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-[#ecd4d2] bg-[#faf1f0] p-3 text-sm text-[#a2504c]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Não foi possível falar com o N8N agora</p>
            <p className="opacity-80">{fetchError}</p>
          </div>
        </div>
      )}

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Workflows
      </p>
      <div className="space-y-2">
        {workflows.length === 0 && !fetchError && (
          <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            Nenhum workflow encontrado nessa instância N8N.
          </p>
        )}
        {workflows.map((w) => {
          const lastExecution = executions.find((e) => e.workflowId === w.id);
          return (
            <div
              key={w.id}
              className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{w.name}</span>
                  <Badge variant={w.active ? "success" : "secondary"}>
                    {w.active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                {lastExecution && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Última execução: {lastExecution.status ?? "desconhecido"}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={executingId === w.id}
                onClick={() => void execute(w.id)}
              >
                <Play className="h-3.5 w-3.5" />
                {executingId === w.id ? "Executando…" : "Executar agora"}
              </Button>
            </div>
          );
        })}
      </div>

      {existingConfig && (
        <>
          <p className="mb-2 mt-6 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Painel N8N
          </p>
          <div className="overflow-hidden rounded-md border">
            <div className="flex items-center justify-between border-b bg-secondary/30 px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {existingConfig.baseUrl}
              </span>
              <a
                href={existingConfig.baseUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Abrir em tela cheia
              </a>
            </div>
            <iframe
              src={existingConfig.baseUrl}
              title="Painel N8N"
              className="h-[420px] w-full"
            />
            <p className="border-t bg-secondary/20 p-2 text-center text-[11px] text-muted-foreground">
              Se o painel não aparecer acima, o N8N pode estar bloqueando incorporação
              (X-Frame-Options) — use &quot;Abrir em tela cheia&quot;.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function N8nSetupForm({
  existing,
  onSaved,
  onCancel,
}: {
  existing: N8nConfigView | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [testResult, setTestResult] = useState<
    { ok: true; workflowCount: number } | { ok: false; message: string } | null
  >(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function test() {
    if (!baseUrl.trim() || !apiKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    const res = await fetch("/api/settings/n8n/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseUrl, apiKey }),
    }).catch(() => null);
    setTesting(false);
    if (!res) {
      setTestResult({ ok: false, message: "Sem conexão com o servidor" });
      return;
    }
    const data = (await res.json().catch(() => null)) as
      | { workflowCount: number }
      | { error?: { message?: string } }
      | null;
    if (res.ok) {
      setTestResult({ ok: true, workflowCount: (data as { workflowCount: number }).workflowCount });
    } else {
      setTestResult({
        ok: false,
        message: (data as { error?: { message?: string } } | null)?.error?.message ?? "A validação falhou",
      });
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    const res = await fetch("/api/settings/n8n", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseUrl, apiKey: apiKey.trim() || undefined }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setSaveError(data?.error?.message ?? "Não foi possível salvar");
      return;
    }
    onSaved();
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="text-center">
        <Workflow className="mx-auto mb-2 h-8 w-8 text-primary" strokeWidth={1.3} />
        <p className="font-medium">
          {existing ? "Atualizar configuração do N8N" : "Configurar automações N8N"}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Conecte a instância N8N da sua própria agência/operação (auto-hospedada) para
          listar e executar workflows aqui dentro. Opcional — sem isso, essa aba fica
          só com esta tela.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="n8n-base-url">URL base do N8N</Label>
        <Input
          id="n8n-base-url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://n8n.seudominio.com.br"
          className="font-mono text-xs"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="n8n-api-key">API Key</Label>
          <Input
            id="n8n-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setTestResult(null);
            }}
            placeholder={existing ? "Salva — cole uma nova para trocar" : "n8n_api_..."}
            className="font-mono text-xs"
          />
        </div>
        <Button
          variant="outline"
          disabled={!baseUrl.trim() || !apiKey.trim() || testing}
          onClick={() => void test()}
          className="self-end"
        >
          <Plug className="h-3.5 w-3.5" />
          {testing ? "Testando…" : "Testar"}
        </Button>
      </div>
      {testResult && (
        <p className={`text-sm ${testResult.ok ? "text-success" : "text-destructive"}`}>
          {testResult.ok ? (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Conectado ·{" "}
              {testResult.workflowCount} workflow(s) encontrado(s)
            </span>
          ) : (
            testResult.message
          )}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Gere a chave em Settings → API → Create API Key, no painel do N8N. Armazenada
        com criptografia AES-256 · nunca exposta ao frontend.
      </p>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button
          disabled={saving || !baseUrl.trim() || (!apiKey.trim() && !existing)}
          onClick={() => void save()}
        >
          {saving ? "Salvando…" : "Salvar configuração"}
        </Button>
      </div>
    </div>
  );
}
