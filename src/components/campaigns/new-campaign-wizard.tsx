"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  FileSpreadsheet,
  Info,
  Megaphone,
  PlayCircle,
  Table,
  Users,
  X,
} from "lucide-react";
import type { CampaignDto, ContactDto, StageDto, TemplateDto } from "@/lib/types";
import { extractVariables, renderNumberedMessage, renderMessage } from "@/lib/campaigns/render";
import { countTemplateVariables } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type CsvPreview = {
  total: number;
  preview: { phone: string; variables: Record<string, string>; variablesOrdered: string[] }[];
  invalidRows: { line: number; reason: string }[];
  variableNames: string[];
};

type CrmCount = { count: number; sample: { phone: string; name: string }[] };

const STEPS = [
  { n: 1, label: "Canal e mensagem" },
  { n: 2, label: "Destinatários" },
  { n: 3, label: "Configurar envio" },
] as const;

const INTERVAL_PRESETS = [
  { seconds: 3, label: "3s — rápido" },
  { seconds: 5, label: "5s — recomendado" },
  { seconds: 10, label: "10s — seguro" },
  { seconds: 30, label: "30s — muito seguro" },
] as const;

export function NewCampaignWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (campaignId: string) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 — canal e mensagem
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"official" | "unofficial">("official");
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [unofficialConnected, setUnofficialConnected] = useState<boolean | null>(null);
  const [messageTemplate, setMessageTemplate] = useState("");
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  // Step 2 — destinatários
  const [recipientTab, setRecipientTab] = useState<"csv" | "crm">("csv");
  const [csvText, setCsvText] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [stages, setStages] = useState<StageDto[]>([]);
  const [crmStageId, setCrmStageId] = useState<string>("");
  const [crmOriginChannel, setCrmOriginChannel] = useState<"" | "official" | "unofficial">("");
  const [crmCount, setCrmCount] = useState<CrmCount | null>(null);
  const [crmLoading, setCrmLoading] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<ContactDto[]>([]);
  const [manualSelected, setManualSelected] = useState<Map<string, ContactDto>>(
    new Map()
  );

  // Step 3 — configurar envio
  const [sendIntervalMs, setSendIntervalMs] = useState(5000);
  const [when, setWhen] = useState<"now" | "schedule">("now");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("08:00");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d: { templates?: TemplateDto[] }) =>
        setTemplates((d.templates ?? []).filter((t) => t.status === "approved"))
      )
      .catch(() => {});
    fetch("/api/settings/channels")
      .then((r) => (r.ok ? r.json() : { status: "disconnected" }))
      .then((d: { status?: string }) =>
        setUnofficialConnected(d.status === "connected")
      )
      .catch(() => setUnofficialConnected(false));
    fetch("/api/pipeline/stages")
      .then((r) => (r.ok ? r.json() : { stages: [] }))
      .then((d: { stages?: StageDto[] }) => setStages(d.stages ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (recipientTab !== "crm") return;
    setCrmLoading(true);
    const params = new URLSearchParams();
    if (crmStageId) params.set("stageId", crmStageId);
    if (crmOriginChannel) params.set("originChannel", crmOriginChannel);
    fetch(`/api/campaigns/crm-recipients?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CrmCount | null) => setCrmCount(d))
      .finally(() => setCrmLoading(false));
  }, [recipientTab, crmStageId, crmOriginChannel]);

  useEffect(() => {
    if (recipientTab !== "crm") return;
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (manualQuery.trim()) params.set("q", manualQuery.trim());
      fetch(`/api/contacts?${params}`)
        .then((r) => (r.ok ? r.json() : { contacts: [] }))
        .then((d: { contacts?: ContactDto[] }) =>
          setManualResults((d.contacts ?? []).slice(0, 20))
        )
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [recipientTab, manualQuery]);

  function toggleManualContact(c: ContactDto) {
    setManualSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c);
      return next;
    });
  }

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const officialVariableCount = selectedTemplate
    ? countTemplateVariables(selectedTemplate.body)
    : 0;
  const messageVariables = channel === "unofficial" ? extractVariables(messageTemplate) : [];

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

  function renderedPreview(variablesOrdered: string[], variables: Record<string, string>): string {
    if (channel === "official") {
      return selectedTemplate ? renderNumberedMessage(selectedTemplate.body, variablesOrdered) : "";
    }
    return renderMessage(messageTemplate, variables);
  }

  const step1Valid =
    name.trim().length > 0 &&
    (channel === "official"
      ? Boolean(templateId)
      : messageTemplate.trim().length > 0 && riskAcknowledged && Boolean(unofficialConnected));

  const step2Valid =
    recipientTab === "csv"
      ? Boolean(csvText && preview && preview.total > 0)
      : Boolean((crmCount && crmCount.count > 0) || manualSelected.size > 0);

  const totalRecipients =
    recipientTab === "csv"
      ? preview?.total ?? 0
      : (crmCount?.count ?? 0) + manualSelected.size;

  const estimatedSeconds =
    channel === "unofficial" ? Math.ceil((totalRecipients * sendIntervalMs) / 1000) : 0;

  function formatEstimate(seconds: number): string {
    if (seconds < 60) return `~${seconds}s`;
    if (seconds < 3600) return `~${Math.ceil(seconds / 60)}min`;
    return `~${(seconds / 3600).toFixed(1)}h`;
  }

  const scheduledAtIso =
    when === "schedule" && scheduleDate && scheduleTime
      ? new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString()
      : null;
  const scheduleInPast =
    when === "schedule" && scheduledAtIso ? new Date(scheduledAtIso).getTime() <= Date.now() : false;

  async function create() {
    setSaving(true);
    setError(null);

    const base = {
      name: name.trim(),
      scheduledAt: scheduledAtIso,
    };
    const sourcePart =
      recipientTab === "csv"
        ? { source: "csv" as const, csvText: csvText! }
        : {
            source: "crm" as const,
            stageId: crmStageId || null,
            originChannel: crmOriginChannel || null,
            contactIds:
              manualSelected.size > 0 ? [...manualSelected.keys()] : undefined,
          };
    const body =
      channel === "official"
        ? { ...base, channel, templateId, ...sourcePart }
        : {
            ...base,
            channel,
            messageTemplate,
            sendIntervalMs,
            riskAcknowledged: true as const,
            ...sourcePart,
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
    const data = (await res.json()) as { campaign: CampaignDto; startError: string | null };
    onCreated(data.campaign.id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="font-semibold">Nova campanha</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {channel === "official" ? "Canal oficial" : "WhatsApp Web"} · disparo personalizado
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 border-b px-5 py-3">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center gap-1">
              {i > 0 && <div className="mx-1 h-px w-5 bg-border" />}
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                  step === s.n
                    ? "bg-brand-tint text-brand-text"
                    : step > s.n
                      ? "bg-secondary text-success"
                      : "text-muted-foreground"
                )}
              >
                {step > s.n ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
                      step === s.n ? "bg-brand text-white" : "border text-muted-foreground"
                    )}
                  >
                    {s.n}
                  </span>
                )}
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <div className="p-5">
          {step === 1 && (
            <Step1
              name={name}
              setName={setName}
              channel={channel}
              setChannel={setChannel}
              templates={templates}
              templateId={templateId}
              setTemplateId={setTemplateId}
              selectedTemplate={selectedTemplate}
              officialVariableCount={officialVariableCount}
              unofficialConnected={unofficialConnected}
              messageTemplate={messageTemplate}
              setMessageTemplate={setMessageTemplate}
              messageVariables={messageVariables}
              riskAcknowledged={riskAcknowledged}
              setRiskAcknowledged={setRiskAcknowledged}
            />
          )}

          {step === 2 && (
            <Step2
              channel={channel}
              selectedTemplate={selectedTemplate}
              officialVariableCount={officialVariableCount}
              messageTemplate={messageTemplate}
              messageVariables={messageVariables}
              recipientTab={recipientTab}
              setRecipientTab={setRecipientTab}
              csvFileName={csvFileName}
              onCsvSelected={onCsvSelected}
              previewing={previewing}
              preview={preview}
              onResetCsv={() => {
                setCsvText(null);
                setCsvFileName(null);
                setPreview(null);
              }}
              renderedPreview={renderedPreview}
              stages={stages}
              crmStageId={crmStageId}
              setCrmStageId={setCrmStageId}
              crmOriginChannel={crmOriginChannel}
              setCrmOriginChannel={setCrmOriginChannel}
              crmCount={crmCount}
              crmLoading={crmLoading}
              manualQuery={manualQuery}
              setManualQuery={setManualQuery}
              manualResults={manualResults}
              manualSelected={manualSelected}
              toggleManualContact={toggleManualContact}
            />
          )}

          {step === 3 && (
            <Step3
              channel={channel}
              totalRecipients={totalRecipients}
              variableCount={channel === "official" ? officialVariableCount : messageVariables.length}
              sendIntervalMs={sendIntervalMs}
              setSendIntervalMs={setSendIntervalMs}
              estimatedLabel={formatEstimate(estimatedSeconds)}
              when={when}
              setWhen={setWhen}
              scheduleDate={scheduleDate}
              setScheduleDate={setScheduleDate}
              scheduleTime={scheduleTime}
              setScheduleTime={setScheduleTime}
              scheduleInPast={scheduleInPast}
            />
          )}

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t bg-secondary/30 px-5 py-4">
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2)}>
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          )}

          {step < 3 ? (
            <Button
              disabled={step === 1 ? !step1Valid : !step2Valid}
              onClick={() => setStep((s) => (s + 1) as 2 | 3)}
            >
              {step === 1 ? "Próximo — destinatários" : "Próximo — configurar envio"}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              disabled={saving || scheduleInPast || totalRecipients === 0}
              onClick={() => void create()}
            >
              <Megaphone className="h-3.5 w-3.5" />
              {saving ? "Criando…" : "Criar campanha"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Step1({
  name,
  setName,
  channel,
  setChannel,
  templates,
  templateId,
  setTemplateId,
  selectedTemplate,
  officialVariableCount,
  unofficialConnected,
  messageTemplate,
  setMessageTemplate,
  messageVariables,
  riskAcknowledged,
  setRiskAcknowledged,
}: {
  name: string;
  setName: (v: string) => void;
  channel: "official" | "unofficial";
  setChannel: (v: "official" | "unofficial") => void;
  templates: TemplateDto[];
  templateId: string;
  setTemplateId: (v: string) => void;
  selectedTemplate: TemplateDto | null;
  officialVariableCount: number;
  unofficialConnected: boolean | null;
  messageTemplate: string;
  setMessageTemplate: (v: string) => void;
  messageVariables: string[];
  riskAcknowledged: boolean;
  setRiskAcknowledged: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="camp-name">Nome da campanha</Label>
        <Input
          id="camp-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Reativação de leads frios — julho"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Canal de envio</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setChannel("official")}
            className={cn(
              "flex flex-1 items-center gap-2 rounded-md border px-3 py-2 text-sm",
              channel === "official"
                ? "border-2 border-brand bg-brand-tint font-medium text-brand-text"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            <Check className="h-4 w-4" /> Oficial (sem risco)
          </button>
          <button
            type="button"
            onClick={() => setChannel("unofficial")}
            className={cn(
              "flex flex-1 items-center gap-2 rounded-md border px-3 py-2 text-sm",
              channel === "unofficial"
                ? "border-2 border-brand bg-brand-tint font-medium text-brand-text"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            <AlertTriangle className="h-4 w-4" /> WhatsApp Web (com risco)
          </button>
        </div>
        {channel === "unofficial" && (
          <div className="mt-1.5 flex items-start gap-2 rounded-md border border-[#ece2cf] bg-[#faf7f0] p-2.5 text-xs text-[#8a6d3b]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Disparo em massa via WhatsApp Web pode resultar em banimento do
            número. Use com cautela.
          </div>
        )}
      </div>

      {channel === "official" ? (
        <div className="space-y-1.5">
          <Label htmlFor="camp-template">Modelo aprovado</Label>
          {templates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum modelo aprovado ainda. Crie um em Configurações → Modelos.
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
          {selectedTemplate && officialVariableCount > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-text-3">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Este modelo usa {officialVariableCount} variável
              {officialVariableCount > 1 ? "eis" : ""} ({"{{1}}"}
              {officialVariableCount > 1 ? ` a {{${officialVariableCount}}}` : ""}
              ): as próximas {officialVariableCount} coluna
              {officialVariableCount > 1 ? "s" : ""} do CSV preenchem, na
              ordem — ou vem só de {"{{1}}"} = nome do contato, se você usar
              a lista do CRM.
            </p>
          )}
        </div>
      ) : (
        <>
          {unofficialConnected === false && (
            <div className="flex items-start gap-2 rounded-md border border-[#ecd4d2] bg-[#faf1f0] p-3 text-xs text-[#a2504c]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Conecte o WhatsApp Web em Configurações → Canais antes de criar
              esta campanha.
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="camp-message">
              Mensagem{" "}
              <span className="font-normal text-muted-foreground">
                (use {"{{variavel}}"} para personalizar)
              </span>
            </Label>
            <Textarea
              id="camp-message"
              rows={4}
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              placeholder="Olá {{nome}}, temos o comprovante {{numero_carga}} da empresa {{empresa}} disponível."
            />
            {messageVariables.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {messageVariables.map((v) => (
                  <span
                    key={v}
                    className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] text-brand-text"
                  >
                    {`{{${v}}}`}
                  </span>
                ))}
              </div>
            )}
          </div>
          <label className="flex items-start gap-2 rounded-md border border-[#ecd4d2] bg-[#faf1f0] p-3 text-xs text-[#a2504c]">
            <input
              type="checkbox"
              checked={riskAcknowledged}
              onChange={(e) => setRiskAcknowledged(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <strong>Risco de banimento:</strong> o WhatsApp Web não é a API
              oficial da Meta. Enviar em massa por ele pode banir o número.
              Uso por minha conta e risco.
            </span>
          </label>
        </>
      )}
    </div>
  );
}

function Step2({
  channel,
  selectedTemplate,
  officialVariableCount,
  messageTemplate,
  messageVariables,
  recipientTab,
  setRecipientTab,
  csvFileName,
  onCsvSelected,
  previewing,
  preview,
  onResetCsv,
  renderedPreview,
  stages,
  crmStageId,
  setCrmStageId,
  crmOriginChannel,
  setCrmOriginChannel,
  crmCount,
  crmLoading,
  manualQuery,
  setManualQuery,
  manualResults,
  manualSelected,
  toggleManualContact,
}: {
  channel: "official" | "unofficial";
  selectedTemplate: TemplateDto | null;
  officialVariableCount: number;
  messageTemplate: string;
  messageVariables: string[];
  recipientTab: "csv" | "crm";
  setRecipientTab: (v: "csv" | "crm") => void;
  csvFileName: string | null;
  onCsvSelected: (file: File) => void;
  previewing: boolean;
  preview: CsvPreview | null;
  onResetCsv: () => void;
  renderedPreview: (variablesOrdered: string[], variables: Record<string, string>) => string;
  stages: StageDto[];
  crmStageId: string;
  setCrmStageId: (v: string) => void;
  crmOriginChannel: "" | "official" | "unofficial";
  setCrmOriginChannel: (v: "" | "official" | "unofficial") => void;
  crmCount: CrmCount | null;
  crmLoading: boolean;
  manualQuery: string;
  setManualQuery: (v: string) => void;
  manualResults: ContactDto[];
  manualSelected: Map<string, ContactDto>;
  toggleManualContact: (c: ContactDto) => void;
}) {
  const summaryText = channel === "official" ? selectedTemplate?.body ?? "" : messageTemplate;
  const summaryVars = channel === "official" ? officialVariableCount : messageVariables.length;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-md border bg-secondary/30 p-3">
        <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">MENSAGEM DA CAMPANHA</p>
          <p className="mt-0.5 text-xs text-foreground">{summaryText || "—"}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {summaryVars} variável(is) detectada(s) · {channel === "official" ? "Oficial" : "WhatsApp Web"}
          </p>
        </div>
      </div>

      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setRecipientTab("csv")}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
            recipientTab === "csv"
              ? "border-brand text-brand-text"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Table className="h-3.5 w-3.5" /> Upload CSV
        </button>
        <button
          type="button"
          onClick={() => setRecipientTab("crm")}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
            recipientTab === "crm"
              ? "border-brand text-brand-text"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Users className="h-3.5 w-3.5" /> Contatos do CRM
        </button>
      </div>

      {recipientTab === "csv" ? (
        <div>
          {!csvFileName ? (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-border-strong bg-secondary/40 p-6 text-center transition-colors hover:bg-accent">
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground" strokeWidth={1.3} />
              <span className="text-sm font-medium">
                Clique para selecionar o CSV
              </span>
              <span className="text-xs text-muted-foreground">
                1ª coluna = telefone · demais colunas = variáveis
              </span>
              <span className="mt-1 rounded-md border bg-card px-3 py-1 text-xs text-muted-foreground">
                Escolher arquivo
              </span>
              <code className="mt-1 rounded bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {channel === "official"
                  ? `telefone, ${Array.from({ length: Math.max(officialVariableCount, 1) }, (_, i) => `var${i + 1}`).join(", ")}`
                  : `telefone, ${messageVariables.length > 0 ? messageVariables.join(", ") : "nome, empresa, ..."}`}
              </code>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onCsvSelected(file);
                }}
              />
            </label>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-success" />
                  <div>
                    <p className="text-sm font-medium">{csvFileName}</p>
                    {preview && (
                      <p className="text-xs text-muted-foreground">
                        {preview.total} contato(s) · {preview.variableNames.length} coluna(s) de variável
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={onResetCsv}>
                  Trocar arquivo
                </Button>
              </div>

              {previewing && <p className="text-xs text-muted-foreground">Lendo CSV…</p>}

              {preview && (
                <>
                  {channel === "official" &&
                    officialVariableCount > 0 &&
                    preview.variableNames.length < officialVariableCount && (
                      <div className="flex items-start gap-2 rounded-md border border-[#ecd4d2] bg-[#faf1f0] p-2.5 text-xs text-[#a2504c]">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        O modelo precisa de {officialVariableCount} coluna(s) de
                        variável além do telefone; o CSV só tem{" "}
                        {preview.variableNames.length}.
                      </div>
                    )}

                  {preview.variableNames.length > 0 && (
                    <div className="rounded-md border bg-secondary/30 p-3">
                      <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                        MAPEAMENTO DE COLUNAS → VARIÁVEIS
                      </p>
                      <div className="space-y-1">
                        {preview.variableNames.map((col, i) => (
                          <div key={col} className="flex items-center gap-2 text-xs">
                            <code className="rounded bg-background px-1.5 py-0.5">{col}</code>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="text-brand-text">
                              {channel === "official" ? `{{${i + 1}}}` : `{{${col}}}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                      PREVIEW — PRIMEIROS {preview.preview.length} CONTATOS
                    </p>
                    <div className="overflow-hidden rounded-md border">
                      {preview.preview.map((row, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex items-start justify-between gap-3 px-3 py-2 text-xs",
                            i > 0 && "border-t"
                          )}
                        >
                          <span className="min-w-0 flex-1 text-foreground">
                            {renderedPreview(row.variablesOrdered, row.variables)}
                          </span>
                          <span className="shrink-0 text-muted-foreground">+{row.phone}</span>
                        </div>
                      ))}
                    </div>
                    {preview.total > preview.preview.length && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {preview.total - preview.preview.length} contato(s) restante(s) não exibido(s)
                        {preview.invalidRows.length > 0 && (
                          <span className="text-destructive">
                            {" "}
                            · {preview.invalidRows.length} erro(s) detectado(s)
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {preview.invalidRows.slice(0, 3).map((r) => (
                    <p key={r.line} className="text-xs text-destructive">
                      Linha {r.line}: {r.reason}
                    </p>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="crm-stage">Etapa do pipeline</Label>
              <select
                id="crm-stage"
                value={crmStageId}
                onChange={(e) => setCrmStageId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">Todas as etapas</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-channel">Canal de origem</Label>
              <select
                id="crm-channel"
                value={crmOriginChannel}
                onChange={(e) =>
                  setCrmOriginChannel(e.target.value as "" | "official" | "unofficial")
                }
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">Todos os canais</option>
                <option value="official">Oficial</option>
                <option value="unofficial">WhatsApp Web</option>
              </select>
            </div>
          </div>

          <div className="rounded-md border bg-secondary/30 p-4 text-center">
            <p className="text-2xl font-semibold">
              {crmLoading ? "…" : (crmCount?.count ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              contato(s) pelo filtro
              {manualSelected.size > 0
                ? ` · +${manualSelected.size} selecionado(s) manualmente`
                : ""}
            </p>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <Label htmlFor="manual-contact-search">
              Selecionar contatos manualmente (opcional)
            </Label>
            <div className="relative">
              <Users className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                id="manual-contact-search"
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                placeholder="Nome ou telefone…"
                className="flex h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-sm"
              />
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {manualResults.length === 0 && (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  {manualQuery.trim()
                    ? "Nenhum contato encontrado."
                    : "Digite pra buscar contatos do CRM."}
                </p>
              )}
              {manualResults.map((c) => (
                <label
                  key={c.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-sm",
                    manualSelected.has(c.id)
                      ? "border-brand bg-brand-tint"
                      : "border-transparent hover:bg-accent"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={manualSelected.has(c.id)}
                    onChange={() => toggleManualContact(c)}
                    className="shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {c.phone}
                  </span>
                </label>
              ))}
            </div>
            {manualSelected.size > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t pt-2">
                {[...manualSelected.values()].map((c) => (
                  <span
                    key={c.id}
                    className="flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-xs text-brand-text"
                  >
                    {c.name}
                    <button
                      type="button"
                      onClick={() => toggleManualContact(c)}
                      aria-label={`Remover ${c.name}`}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {channel === "official"
              ? officialVariableCount > 1
                ? `Só {{1}} é preenchida (com o nome do contato) — o modelo usa ${officialVariableCount} variáveis, então prefira CSV para preencher todas.`
                : officialVariableCount === 1
                  ? "{{1}} é preenchida automaticamente com o nome do contato."
                  : "Este modelo não usa variáveis."
              : messageVariables.length > 0
                ? `Só {{nome}} é preenchida automaticamente (nome do contato). ${messageVariables.filter((v) => v !== "nome").length > 0 ? `As demais (${messageVariables.filter((v) => v !== "nome").join(", ")}) ficam com o texto {{variavel}} visível — considere usar CSV.` : ""}`
                : "Nenhuma variável na mensagem."}
          </p>
        </div>
      )}
    </div>
  );
}

function Step3({
  channel,
  totalRecipients,
  variableCount,
  sendIntervalMs,
  setSendIntervalMs,
  estimatedLabel,
  when,
  setWhen,
  scheduleDate,
  setScheduleDate,
  scheduleTime,
  setScheduleTime,
  scheduleInPast,
}: {
  channel: "official" | "unofficial";
  totalRecipients: number;
  variableCount: number;
  sendIntervalMs: number;
  setSendIntervalMs: (v: number) => void;
  estimatedLabel: string;
  when: "now" | "schedule";
  setWhen: (v: "now" | "schedule") => void;
  scheduleDate: string;
  setScheduleDate: (v: string) => void;
  scheduleTime: string;
  setScheduleTime: (v: string) => void;
  scheduleInPast: boolean;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="destinatários" value={String(totalRecipients)} />
        <StatBox label="variáveis" value={String(variableCount)} />
        {channel === "unofficial" ? (
          <StatBox label="tempo estimado" value={estimatedLabel} warn />
        ) : (
          <StatBox label="canal" value="Oficial" />
        )}
      </div>

      {channel === "unofficial" && (
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium">Intervalo entre envios</p>
            <p className="text-xs text-muted-foreground">
              Intervalo maior reduz risco de ban no WhatsApp Web
            </p>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="camp-interval">Intervalo (segundos)</Label>
                <Input
                  id="camp-interval"
                  type="number"
                  min={1}
                  max={300}
                  className="w-24"
                  value={Math.round(sendIntervalMs / 1000)}
                  onChange={(e) =>
                    setSendIntervalMs(Math.max(1000, Number(e.target.value) * 1000 || 1000))
                  }
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tempo estimado total</p>
                <p className="text-lg font-semibold text-warning">{estimatedLabel}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {INTERVAL_PRESETS.map((p) => (
                <button
                  key={p.seconds}
                  type="button"
                  onClick={() => setSendIntervalMs(p.seconds * 1000)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px]",
                    Math.round(sendIntervalMs / 1000) === p.seconds
                      ? "border-2 border-brand bg-brand-tint font-medium text-brand-text"
                      : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">Quando disparar</p>
        </div>
        <div className="flex gap-2 p-4">
          <button
            type="button"
            onClick={() => setWhen("now")}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 rounded-md border px-3 py-2.5 text-center",
              when === "now"
                ? "border-2 border-brand bg-brand-tint text-brand-text"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            <PlayCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Agora</span>
            <span className="text-[11px] opacity-70">Iniciar imediatamente</span>
          </button>
          <button
            type="button"
            onClick={() => setWhen("schedule")}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 rounded-md border px-3 py-2.5 text-center",
              when === "schedule"
                ? "border-2 border-brand bg-brand-tint text-brand-text"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            <CalendarClock className="h-4 w-4" />
            <span className="text-sm font-medium">Agendar</span>
            <span className="text-[11px] opacity-70">Escolher data e hora</span>
          </button>
        </div>
        {when === "schedule" && (
          <div className="grid grid-cols-2 gap-2 px-4 pb-4">
            <div className="space-y-1.5">
              <Label htmlFor="sched-date">Data</Label>
              <Input
                id="sched-date"
                type="date"
                min={todayIso}
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sched-time">Hora</Label>
              <Input
                id="sched-time"
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
              />
            </div>
            {scheduleInPast && (
              <p className="col-span-2 flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> Escolha uma data/hora no futuro
              </p>
            )}
          </div>
        )}
      </div>

      {channel === "unofficial" && (
        <div className="flex items-start gap-2 rounded-md border border-[#ece2cf] bg-[#faf7f0] p-3 text-xs text-[#8a6d3b]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>WhatsApp Web:</strong> disparo em massa pode resultar em
            banimento do número. Recomendamos intervalos de 5s ou mais e
            listas de até 500 contatos por vez.
          </span>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-md border bg-secondary/30 p-2.5 text-center">
      <p className={cn("text-lg font-semibold", warn && "text-warning")}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
