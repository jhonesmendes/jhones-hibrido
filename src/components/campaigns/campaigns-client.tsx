"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Megaphone, Plus } from "lucide-react";
import type { CampaignDto, TemplateDto } from "@/lib/types";
import { extractVariables } from "@/lib/campaigns/render";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATUS_BADGE: Record<
  CampaignDto["status"],
  { label: string; variant: "secondary" | "warning" | "success" | "destructive" }
> = {
  draft: { label: "Rascunho", variant: "secondary" },
  sending: { label: "Enviando", variant: "warning" },
  sent: { label: "Enviada", variant: "success" },
  cancelled: { label: "Cancelada", variant: "destructive" },
};

export function CampaignsClient() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignDto[] | null>(null);
  const [creating, setCreating] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/campaigns").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { campaigns: CampaignDto[] };
    setCampaigns(data.campaigns);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <h2 className="font-semibold">Campanhas</h2>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" strokeWidth={1.7} />
          Nova campanha
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {campaigns === null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : campaigns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Megaphone className="h-8 w-8 text-text-3" strokeWidth={1.3} />
            <p className="text-sm font-medium">Nenhuma campanha ainda</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Crie uma campanha para enviar uma mensagem a vários contatos de
              uma vez, importando uma lista por CSV.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/campanhas/${c.id}`}
                  className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {c.name}
                      </span>
                      <Badge variant="secondary">
                        {c.channel === "official" ? "Oficial" : "Não oficial"}
                      </Badge>
                      <Badge variant={STATUS_BADGE[c.status].variant}>
                        {STATUS_BADGE[c.status].label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.total} destinatário(s) · {c.sent} enviado(s) ·{" "}
                      {c.failed} falhou(aram)
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && (
        <NewCampaignDialog
          onClose={() => setCreating(false)}
          onCreated={(campaignId) => {
            setCreating(false);
            router.push(`/campanhas/${campaignId}`);
          }}
        />
      )}
    </div>
  );
}

type CsvPreview = {
  total: number;
  preview: { phone: string; variables: Record<string, string> }[];
  invalidRows: { line: number; reason: string }[];
  variableNames: string[];
};

function NewCampaignDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (campaignId: string) => void;
}) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"official" | "unofficial">("official");
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [unofficialConnected, setUnofficialConnected] = useState<boolean | null>(
    null
  );
  const [messageTemplate, setMessageTemplate] = useState("");
  const [sendIntervalMs, setSendIntervalMs] = useState(5000);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d: { templates?: TemplateDto[] }) =>
        setTemplates((d.templates ?? []).filter((t) => t.status === "approved"))
      )
      .catch(() => {});
    fetch("/api/settings/channels")
      .then((r) => (r.ok ? r.json() : { channel: null }))
      .then((d: { channel?: { status?: string } | null }) =>
        setUnofficialConnected(Boolean(d.channel))
      )
      .catch(() => setUnofficialConnected(false));
  }, []);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const messageVariables =
    channel === "unofficial" ? extractVariables(messageTemplate) : [];

  async function onCsvSelected(file: File) {
    const text = await file.text();
    setCsvText(text);
    setCsvFileName(file.name);
    setPreviewing(true);
    setPreview(null);
    setError(null);
    const res = await fetch("/api/campaigns/import-csv", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csvText: text }),
    }).catch(() => null);
    setPreviewing(false);
    if (!res?.ok) {
      setError("Não foi possível ler o CSV");
      return;
    }
    setPreview((await res.json()) as CsvPreview);
  }

  const canCreate =
    name.trim().length > 0 &&
    csvText &&
    preview &&
    preview.total > 0 &&
    !saving &&
    (channel === "official"
      ? Boolean(templateId)
      : messageTemplate.trim().length > 0 &&
        riskAcknowledged &&
        Boolean(unofficialConnected));

  async function create() {
    if (!csvText) return;
    setSaving(true);
    setError(null);
    const body =
      channel === "official"
        ? { name: name.trim(), channel, templateId, csvText }
        : {
            name: name.trim(),
            channel,
            messageTemplate,
            sendIntervalMs,
            riskAcknowledged: true as const,
            csvText,
          };
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Não foi possível criar a campanha");
      return;
    }
    const data = (await res.json()) as { campaign: { id: string } };
    onCreated(data.campaign.id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-semibold">Nova campanha</h3>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="camp-name">Nome</Label>
            <Input
              id="camp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Reativação de leads frios — julho"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Canal</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setChannel("official")}
                className={
                  channel === "official"
                    ? "rounded-md border border-brand bg-brand-tint px-3 py-2 text-sm font-medium text-brand-text"
                    : "rounded-md border px-3 py-2 text-sm text-text-2 hover:bg-accent"
                }
              >
                Oficial (sem risco)
              </button>
              <button
                type="button"
                onClick={() => setChannel("unofficial")}
                className={
                  channel === "unofficial"
                    ? "rounded-md border border-brand bg-brand-tint px-3 py-2 text-sm font-medium text-brand-text"
                    : "rounded-md border px-3 py-2 text-sm text-text-2 hover:bg-accent"
                }
              >
                Não oficial (com risco)
              </button>
            </div>
          </div>

          {channel === "official" ? (
            <div className="space-y-1.5">
              <Label htmlFor="camp-template">Modelo aprovado</Label>
              {templates.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum modelo aprovado ainda. Crie um em Configurações →
                  Modelos.
                </p>
              ) : (
                <select
                  id="camp-template"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">Escolha um modelo…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.language})
                    </option>
                  ))}
                </select>
              )}
              {selectedTemplate && (
                <p className="rounded-md bg-secondary/60 p-2.5 text-xs text-muted-foreground">
                  {selectedTemplate.body}
                </p>
              )}
              {selectedTemplate && /\{\{\s*1\s*\}\}/.test(selectedTemplate.body) && (
                <p className="text-xs text-text-3">
                  Este modelo usa <code>{"{{1}}"}</code>: a{" "}
                  <strong>segunda coluna</strong> do CSV preenche essa
                  variável para cada destinatário.
                </p>
              )}
            </div>
          ) : (
            <>
              {unofficialConnected === false && (
                <div className="flex items-start gap-2 rounded-md border border-[#ecd4d2] bg-[#faf1f0] p-3 text-xs text-[#a2504c]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Conecte o canal não oficial em Configurações → Canal não
                  oficial antes de criar esta campanha.
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="camp-message">Mensagem</Label>
                <Textarea
                  id="camp-message"
                  rows={4}
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  placeholder="Olá {{nome}}, aqui é da {{empresa}}! Temos uma novidade para você."
                />
                {messageVariables.length > 0 && (
                  <p className="text-xs text-text-3">
                    Variáveis detectadas:{" "}
                    {messageVariables.map((v) => (
                      <code key={v} className="mr-1">
                        {`{{${v}}}`}
                      </code>
                    ))}
                    — cada uma vira uma coluna no CSV (nome da coluna = nome
                    da variável).
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="camp-interval">
                  Intervalo entre envios (segundos)
                </Label>
                <Input
                  id="camp-interval"
                  type="number"
                  min={1}
                  max={300}
                  value={Math.round(sendIntervalMs / 1000)}
                  onChange={(e) =>
                    setSendIntervalMs(
                      Math.max(1000, Number(e.target.value) * 1000 || 1000)
                    )
                  }
                />
                <p className="text-xs text-text-3">
                  Recomendado: 5-10s. Nunca é fixo — você decide o ritmo.
                </p>
              </div>
              <label className="flex items-start gap-2 rounded-md border border-[#ecd4d2] bg-[#faf1f0] p-3 text-xs text-[#a2504c]">
                <input
                  type="checkbox"
                  checked={riskAcknowledged}
                  onChange={(e) => setRiskAcknowledged(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <strong>Risco de banimento:</strong> o canal não oficial não
                  é a API oficial da Meta. Enviar em massa por ele pode banir
                  o número. Uso por minha conta e risco.
                </span>
              </label>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="camp-csv">
              Lista de destinatários (CSV — 1ª coluna: telefone)
            </Label>
            <input
              ref={fileRef}
              id="camp-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onCsvSelected(file);
              }}
              className="block w-full text-sm text-text-2 file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
            />
            {csvFileName && (
              <p className="text-xs text-text-3">{csvFileName}</p>
            )}
            {previewing && (
              <p className="text-xs text-text-3">Lendo CSV…</p>
            )}
            {preview && (
              <div className="rounded-md border bg-secondary/60 p-2.5 text-xs">
                <p className="font-medium">
                  {preview.total} destinatário(s) válido(s)
                  {preview.invalidRows.length > 0
                    ? ` · ${preview.invalidRows.length} linha(s) inválida(s)`
                    : ""}
                </p>
                {preview.invalidRows.slice(0, 3).map((r) => (
                  <p key={r.line} className="mt-1 text-destructive">
                    Linha {r.line}: {r.reason}
                  </p>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!canCreate} onClick={() => void create()}>
            {saving ? "Criando…" : "Criar campanha"}
          </Button>
        </div>
      </div>
    </div>
  );
}
