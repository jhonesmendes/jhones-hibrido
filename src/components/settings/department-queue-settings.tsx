"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type BusinessHoursDay = { enabled: boolean; start: string; end: string };
export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type BusinessHours = Partial<Record<DayKey, BusinessHoursDay>>;

export type QueueDepartment = {
  id: string;
  queueEnabled: boolean;
  routingMode: "automatic" | "client-selection";
  distributionMode: "round-robin" | "least-busy" | "first-available" | "manual" | null;
  selectionGreeting: string | null;
  selectionFormat: "numbered" | "letters" | null;
  selectionShowOnlyOnline: boolean | null;
  selectionTimeoutSeconds: number | null;
  selectionTimeoutAction: "auto-assign" | "queue" | "ai-assumes" | null;
  selectionUnavailableMessage: string | null;
  acceptTimeoutSeconds: number | null;
  acceptTimeoutAction: "next-agent" | "queue" | "ai-assumes" | null;
  maxConversationsPerAgent: number | null;
  maxQueueSize: number | null;
  queueMessage: string | null;
  noAgentsMessage: string | null;
  offlineMessage: string | null;
  transferMessage: string | null;
  awayMessage: string | null;
  businessHours: BusinessHours | null;
  timezone: string;
};

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (America/Sao_Paulo)" },
  { value: "America/Manaus", label: "Manaus (America/Manaus)" },
  { value: "America/Cuiaba", label: "Cuiabá (America/Cuiaba)" },
  { value: "America/Rio_Branco", label: "Rio Branco (America/Rio_Branco)" },
  { value: "America/Noronha", label: "Fernando de Noronha (America/Noronha)" },
];

const SAMPLE_AGENTS = ["Ana Silva", "Carlos Rocha", "Maria Fonseca"];

const DEFAULT_DAY: BusinessHoursDay = { enabled: false, start: "08:00", end: "18:00" };

function inputCls(extra = "") {
  return cn(
    "flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm",
    extra
  );
}

function renderPreview(greeting: string, format: "numbered" | "letters" | null): string {
  const text = (greeting || "Olá {{nome}}! Com qual atendente você deseja falar?").replace(
    "{{nome}}",
    "João"
  );
  const list = SAMPLE_AGENTS.map((name, i) => {
    const label = format === "letters" ? String.fromCharCode(65 + i) : String(i + 1);
    return `${label}. ${name}`;
  }).join("\n");
  return `${text}\n${list}`;
}

/**
 * Configuração completa de fila e roteamento (Sprint Q4) — Modo A
 * (distribuição automática) e Modo B (seleção pelo cliente), timeouts,
 * mensagens automáticas e horário de funcionamento. Estado local até
 * "Salvar configurações da fila"; os toggles rápidos (ativar fila / modo
 * de roteamento) continuam salvando na hora, como já era.
 */
export function DepartmentQueueSettings({
  department: d,
  onToggleQueue,
  onSetRoutingMode,
  onChanged,
}: {
  department: QueueDepartment;
  onToggleQueue: () => Promise<void>;
  onSetRoutingMode: (mode: "automatic" | "client-selection") => Promise<void>;
  onChanged: () => void;
}) {
  const [distributionMode, setDistributionMode] = useState(d.distributionMode ?? "round-robin");
  const [selectionGreeting, setSelectionGreeting] = useState(d.selectionGreeting ?? "");
  const [selectionFormat, setSelectionFormat] = useState(d.selectionFormat ?? "numbered");
  const [selectionShowOnlyOnline, setSelectionShowOnlyOnline] = useState(
    d.selectionShowOnlyOnline ?? true
  );
  const [selectionTimeoutSeconds, setSelectionTimeoutSeconds] = useState(
    d.selectionTimeoutSeconds ?? 105
  );
  const [selectionTimeoutAction, setSelectionTimeoutAction] = useState(
    d.selectionTimeoutAction ?? "auto-assign"
  );
  const [selectionUnavailableMessage, setSelectionUnavailableMessage] = useState(
    d.selectionUnavailableMessage ?? ""
  );
  const [acceptTimeoutSeconds, setAcceptTimeoutSeconds] = useState(d.acceptTimeoutSeconds ?? 120);
  const [acceptTimeoutAction, setAcceptTimeoutAction] = useState(
    d.acceptTimeoutAction ?? "next-agent"
  );
  const [maxConversationsPerAgent, setMaxConversationsPerAgent] = useState(
    d.maxConversationsPerAgent ?? 5
  );
  const [maxQueueSize, setMaxQueueSize] = useState(d.maxQueueSize ?? 50);
  const [queueMessage, setQueueMessage] = useState(d.queueMessage ?? "");
  const [noAgentsMessage, setNoAgentsMessage] = useState(d.noAgentsMessage ?? "");
  const [offlineMessage, setOfflineMessage] = useState(d.offlineMessage ?? "");
  const [transferMessage, setTransferMessage] = useState(d.transferMessage ?? "");
  const [awayMessage, setAwayMessage] = useState(d.awayMessage ?? "");
  const [timezone, setTimezone] = useState(d.timezone || "America/Sao_Paulo");
  const [businessHours, setBusinessHours] = useState<BusinessHours>(d.businessHours ?? {});

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function day(key: DayKey): BusinessHoursDay {
    return businessHours[key] ?? DEFAULT_DAY;
  }
  function setDay(keys: DayKey[], patch: Partial<BusinessHoursDay>) {
    setBusinessHours((prev) => {
      const next = { ...prev };
      for (const key of keys) next[key] = { ...day(key), ...patch };
      return next;
    });
  }

  async function saveQueueSettings() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const res = await fetch(`/api/settings/departments/${d.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        distributionMode,
        selectionGreeting: selectionGreeting.trim() || null,
        selectionFormat,
        selectionShowOnlyOnline,
        selectionTimeoutSeconds,
        selectionTimeoutAction,
        selectionUnavailableMessage: selectionUnavailableMessage.trim() || null,
        acceptTimeoutSeconds,
        acceptTimeoutAction,
        maxConversationsPerAgent,
        maxQueueSize,
        queueMessage: queueMessage.trim() || null,
        noAgentsMessage: noAgentsMessage.trim() || null,
        offlineMessage: offlineMessage.trim() || null,
        transferMessage: transferMessage.trim() || null,
        awayMessage: awayMessage.trim() || null,
        timezone,
        businessHours,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Não foi possível salvar a configuração da fila");
      return;
    }
    setSaved(true);
    onChanged();
  }

  return (
    <div className="space-y-4 border-t pt-4">
      <div>
        <p className="text-sm font-medium">Fila e roteamento</p>
        <p className="text-xs text-muted-foreground">
          Sem fila ativa (padrão), o departamento funciona como hoje — todo
          membro vê as conversas assim que chegam.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={d.queueEnabled}
          onChange={() => void onToggleQueue()}
          className="h-4 w-4"
        />
        Ativar fila para este departamento
      </label>

      {d.queueEnabled && (
        <div className="space-y-4">
          {/* Modo de roteamento */}
          <div className="grid gap-2 sm:grid-cols-2">
            <label
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-md border p-3",
                d.routingMode === "automatic" && "border-brand bg-brand-tint"
              )}
            >
              <input
                type="radio"
                className="mt-0.5"
                checked={d.routingMode === "automatic"}
                onChange={() => void onSetRoutingMode("automatic")}
              />
              <span>
                <span className="block text-sm font-medium">Automático</span>
                <span className="block text-xs text-muted-foreground">
                  Sistema distribui sem interação do cliente
                </span>
              </span>
            </label>
            <label
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-md border p-3",
                d.routingMode === "client-selection" && "border-brand bg-brand-tint"
              )}
            >
              <input
                type="radio"
                className="mt-0.5"
                checked={d.routingMode === "client-selection"}
                onChange={() => void onSetRoutingMode("client-selection")}
              />
              <span>
                <span className="block text-sm font-medium">Seleção pelo cliente</span>
                <span className="block text-xs text-muted-foreground">
                  O cliente escolhe com qual atendente falar
                </span>
              </span>
            </label>
          </div>

          {d.routingMode === "automatic" && (
            <div className="space-y-1.5">
              <Label>Modo de distribuição</Label>
              <select
                value={distributionMode}
                onChange={(e) => setDistributionMode(e.target.value as typeof distributionMode)}
                className={inputCls()}
              >
                <option value="round-robin">Round-robin — revezamento</option>
                <option value="least-busy">Menor fila — quem tem menos conversas</option>
                <option value="first-available">Primeiro a responder</option>
                <option value="manual">Manual — agente escolhe na tela de Fila</option>
              </select>
            </div>
          )}

          {d.routingMode === "client-selection" && (
            <div className="rounded-lg border">
              <div className="border-b px-3 py-2 text-sm font-medium">Configuração da seleção</div>
              <div className="space-y-3 p-3">
                <div className="space-y-1.5">
                  <Label>
                    Mensagem de saudação{" "}
                    <span className="font-normal text-muted-foreground">
                      · use {"{{nome}}"} para personalizar
                    </span>
                  </Label>
                  <Textarea
                    rows={2}
                    value={selectionGreeting}
                    onChange={(e) => setSelectionGreeting(e.target.value)}
                    placeholder="Olá {{nome}}! Com qual atendente você deseja falar?"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Formato da lista</Label>
                    <select
                      value={selectionFormat}
                      onChange={(e) => setSelectionFormat(e.target.value as typeof selectionFormat)}
                      className={inputCls()}
                    >
                      <option value="numbered">Numerado — 1. João, 2. Maria</option>
                      <option value="letters">Letras — A. João, B. Maria</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Exibir agentes</Label>
                    <select
                      value={selectionShowOnlyOnline ? "online" : "all"}
                      onChange={(e) => setSelectionShowOnlyOnline(e.target.value === "online")}
                      className={inputCls()}
                    >
                      <option value="online">Apenas online</option>
                      <option value="all">Todos, com status</option>
                    </select>
                  </div>
                </div>
                <div className="rounded-md border bg-secondary/50 p-2.5">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Preview
                  </p>
                  <pre className="whitespace-pre-wrap font-sans text-xs text-muted-foreground">
                    {renderPreview(selectionGreeting, selectionFormat)}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Timeouts */}
          <div className="rounded-lg border">
            <div className="border-b px-3 py-2 text-sm font-medium">Timeouts e ações</div>
            <div className="space-y-3 p-3">
              {d.routingMode === "client-selection" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Tempo para o cliente escolher</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="w-24"
                        value={selectionTimeoutSeconds}
                        onChange={(e) => setSelectionTimeoutSeconds(Number(e.target.value))}
                      />
                      <span className="text-xs text-muted-foreground">segundos</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Se não escolher</Label>
                    <select
                      value={selectionTimeoutAction}
                      onChange={(e) =>
                        setSelectionTimeoutAction(e.target.value as typeof selectionTimeoutAction)
                      }
                      className={inputCls()}
                    >
                      <option value="auto-assign">Distribuir automaticamente</option>
                      <option value="queue">Entrar na fila de espera</option>
                      <option value="ai-assumes">IA assume</option>
                    </select>
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Tempo para o agente aceitar</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="w-24"
                      value={acceptTimeoutSeconds}
                      onChange={(e) => setAcceptTimeoutSeconds(Number(e.target.value))}
                    />
                    <span className="text-xs text-muted-foreground">segundos</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Se não aceitar</Label>
                  <select
                    value={acceptTimeoutAction}
                    onChange={(e) => setAcceptTimeoutAction(e.target.value as typeof acceptTimeoutAction)}
                    className={inputCls()}
                  >
                    <option value="next-agent">Próximo agente disponível</option>
                    <option value="queue">Fila de espera</option>
                    <option value="ai-assumes">IA assume temporariamente</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Máx. conversas simultâneas por agente</Label>
                  <Input
                    type="number"
                    className="w-24"
                    value={maxConversationsPerAgent}
                    onChange={(e) => setMaxConversationsPerAgent(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tamanho máximo da fila</Label>
                  <Input
                    type="number"
                    className="w-24"
                    value={maxQueueSize}
                    onChange={(e) => setMaxQueueSize(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Mensagens automáticas */}
          <div className="rounded-lg border">
            <div className="border-b px-3 py-2 text-sm font-medium">Mensagens automáticas</div>
            <div className="space-y-3 p-3">
              <div className="space-y-1.5">
                <Label>
                  Fila de espera{" "}
                  <span className="font-normal text-muted-foreground">· {"{{posicao}}"} disponível</span>
                </Label>
                <Textarea
                  rows={2}
                  value={queueMessage}
                  onChange={(e) => setQueueMessage(e.target.value)}
                  placeholder="Você está na posição {{posicao}} da fila. Em breve um atendente irá te atender!"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sem agentes disponíveis</Label>
                <Textarea
                  rows={2}
                  value={noAgentsMessage}
                  onChange={(e) => setNoAgentsMessage(e.target.value)}
                  placeholder="No momento todos os atendentes estão ocupados. Vamos te atender assim que possível."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fora do horário</Label>
                <Textarea
                  rows={2}
                  value={offlineMessage}
                  onChange={(e) => setOfflineMessage(e.target.value)}
                  placeholder="No momento estamos fora do horário de atendimento. Deixe sua mensagem e retornaremos assim que possível."
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Transferência{" "}
                  <span className="font-normal text-muted-foreground">· {"{{agente}}"} disponível</span>
                </Label>
                <Textarea
                  rows={2}
                  value={transferMessage}
                  onChange={(e) => setTransferMessage(e.target.value)}
                  placeholder="Seu atendimento foi transferido para {{agente}}."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Atendente ausente</Label>
                <Textarea
                  rows={2}
                  value={awayMessage}
                  onChange={(e) => setAwayMessage(e.target.value)}
                  placeholder="Seu atendente precisou se ausentar. Deseja aguardar ou falar com outro?"
                />
              </div>
              {d.routingMode === "client-selection" && (
                <div className="space-y-1.5">
                  <Label>
                    Agente escolhido indisponível{" "}
                    <span className="font-normal text-muted-foreground">· {"{{agente}}"} não respondeu</span>
                  </Label>
                  <Textarea
                    rows={2}
                    value={selectionUnavailableMessage}
                    onChange={(e) => setSelectionUnavailableMessage(e.target.value)}
                    placeholder="{{agente}} não está disponível no momento. Deseja falar com outro atendente?"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Horário de funcionamento */}
          <div className="rounded-lg border">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-medium">Horário de funcionamento</span>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="h-7 rounded-md border border-input bg-card px-2 text-xs"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 p-3">
              <BusinessHoursRow
                label="Seg–Sex"
                day={day("mon")}
                onToggle={(enabled) => setDay(["mon", "tue", "wed", "thu", "fri"], { enabled })}
                onStart={(start) => setDay(["mon", "tue", "wed", "thu", "fri"], { start })}
                onEnd={(end) => setDay(["mon", "tue", "wed", "thu", "fri"], { end })}
              />
              <BusinessHoursRow
                label="Sábado"
                day={day("sat")}
                onToggle={(enabled) => setDay(["sat"], { enabled })}
                onStart={(start) => setDay(["sat"], { start })}
                onEnd={(end) => setDay(["sat"], { end })}
              />
              <BusinessHoursRow
                label="Domingo"
                day={day("sun")}
                onToggle={(enabled) => setDay(["sun"], { enabled })}
                onStart={(start) => setDay(["sun"], { start })}
                onEnd={(end) => setDay(["sun"], { end })}
              />
              <p className="pt-1 text-xs text-muted-foreground">
                Sem nenhum dia marcado, a fila fica sempre &ldquo;dentro do
                horário&rdquo; (não bloqueia ninguém por engano).
              </p>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={saving} onClick={() => void saveQueueSettings()}>
              {saving ? "Salvando…" : "Salvar configurações da fila"}
            </Button>
            {saved && !saving && (
              <span className="text-xs text-[#3f6b52]">Salvo ✓</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BusinessHoursRow({
  label,
  day,
  onToggle,
  onStart,
  onEnd,
}: {
  label: string;
  day: BusinessHoursDay;
  onToggle: (enabled: boolean) => void;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b py-1.5 last:border-b-0">
      <label className="flex w-24 shrink-0 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={day.enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4"
        />
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="time"
          value={day.start}
          disabled={!day.enabled}
          onChange={(e) => onStart(e.target.value)}
          className="h-8 rounded-md border border-input bg-card px-2 text-xs disabled:opacity-50"
        />
        <span className="text-xs text-muted-foreground">até</span>
        <input
          type="time"
          value={day.end}
          disabled={!day.enabled}
          onChange={(e) => onEnd(e.target.value)}
          className="h-8 rounded-md border border-input bg-card px-2 text-xs disabled:opacity-50"
        />
      </div>
    </div>
  );
}
