"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Clock,
  FlaskConical,
  ListChecks,
  MessageCircle,
  Users,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DepartmentMetrics = {
  id: string | null;
  name: string;
  agentProfileName: string | null;
  memberCount: number;
  officialChannels: number;
  officialConnected: number;
  unofficialChannels: number;
  unofficialConnected: number;
  openConversations: number;
  handoffPending: number;
  unreadTotal: number;
};

type DashboardAlert = {
  departmentName: string | null;
  type: "reconnect_required" | "handoff_backlog" | "no_agent_profile";
  message: string;
};

type Department = { id: string; name: string };

type DashboardData = {
  departments: DepartmentMetrics[];
  alerts: DashboardAlert[];
  summary: {
    openConversations: number;
    agentsOnline: number;
    agentsTotal: number;
    queueWaiting: number;
    queueLongestWaitMin: number | null;
    windowExpired: number;
  };
  volumeByDay: { date: string; count: number }[];
  agents: { id: string; name: string; status: string; messagesSentToday: number }[];
  lab: { score: number | null; delta: number | null; handoffsToday: number };
  pipeline: { stageId: string; name: string; kind: string; count: number }[];
  channels: {
    official: { connected: number; total: number; messages: number };
    unofficial: { connected: number; total: number; messages: number };
  };
};

const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  online: "Online",
  away: "Ausente",
  busy: "Ocupado",
  offline: "Offline",
};
const STATUS_DOT: Record<string, string> = {
  online: "bg-fill-success",
  away: "bg-fill-warning",
  busy: "bg-fill-warning",
  offline: "bg-border-strong",
};

const STAGE_COLOR: Record<string, string> = {
  won: "text-success",
  lost: "text-destructive",
  open: "text-foreground",
};

/**
 * Dashboard (v0.2) — owner vê todos os departamentos + o que ainda não tem
 * departamento; admin vê só os departamentos aos quais pertence. Agente
 * comum não tem acesso (403; o link nem aparece no menu). KPIs/ranking/
 * canais/pipeline/Laboratório são todos computados a partir de dados que
 * já existem — "tempo médio de resposta" e "% resolvida pela IA" ficam de
 * fora de propósito (não há definição de "resolvida" nem rastreio de tempo
 * de resposta hoje; fica pra uma fase 2, depende de decisão de produto).
 */
export function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["value"]>("today");
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    fetch("/api/settings/departments")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { departments: Department[] } | null) => setDepartments(d?.departments ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedId) params.set("departmentId", selectedId);
    params.set("period", period);
    fetch(`/api/dashboard?${params.toString()}`)
      .then(async (r) => {
        if (r.status === 403) {
          setForbidden(true);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((d) => {
        if (d) setData(d);
      })
      .catch(() => {});
  }, [selectedId, period]);

  if (forbidden) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        O dashboard é visível só para o proprietário e administradores da organização.
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const maxVolume = Math.max(1, ...data.volumeByDay.map((v) => v.count));
  const totalChannelMsgs = data.channels.official.messages + data.channels.unofficial.messages;

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Visão consolidada dos departamentos que você acessa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 rounded-md border bg-secondary/40 p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  period === p.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {departments.length > 1 && (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="h-9 rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="">Todos os departamentos</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      <div className="space-y-6 p-6">
        {data.alerts.length > 0 && (
          <div className="space-y-2">
            {data.alerts.map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg border border-[#ecd4d2] bg-[#faf1f0] p-3 text-sm"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-[#a2504c]">
                  {a.departmentName && (
                    <span className="font-medium">{a.departmentName}: </span>
                  )}
                  {a.message}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            label="Conversas abertas"
            value={String(data.summary.openConversations)}
          />
          <KpiCard
            icon={<Users className="h-3.5 w-3.5" />}
            label="Atendentes online"
            value={`${data.summary.agentsOnline} / ${data.summary.agentsTotal}`}
          />
          <KpiCard
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Na fila agora"
            value={String(data.summary.queueWaiting)}
            hint={
              data.summary.queueLongestWaitMin != null
                ? `mais antiga: ${data.summary.queueLongestWaitMin} min`
                : undefined
            }
            tone={data.summary.queueWaiting > 0 ? "warning" : undefined}
          />
          <KpiCard
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            label="Janela de 24h expirada"
            value={String(data.summary.windowExpired)}
            tone={data.summary.windowExpired > 0 ? "destructive" : undefined}
          />
        </div>

        {/* Volume + Atendentes */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Volume — últimos 7 dias</CardTitle>
              <CardDescription>Mensagens (entrada e saída), conversas reais.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-24 items-end gap-2">
                {data.volumeByDay.map((v) => {
                  const d = new Date(`${v.date}T00:00:00`);
                  const label = d.toLocaleDateString("pt-BR", { weekday: "narrow" });
                  // Altura em px (não %): dentro de um flex container com
                  // items-end, um filho não tem altura resolvida pro pai —
                  // % de altura vira 0 silenciosamente (por isso o gráfico
                  // parecia vazio mesmo com dado real vindo da API).
                  const barHeight = Math.max(4, Math.round((v.count / maxVolume) * 80));
                  return (
                    <div
                      key={v.date}
                      className="flex flex-1 flex-col items-center justify-end gap-1.5"
                    >
                      <div
                        className="w-full rounded-t bg-brand/70"
                        style={{ height: `${barHeight}px` }}
                        title={`${v.count} mensagens`}
                      />
                      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Atendentes</CardTitle>
              <CardDescription>Status ao vivo e mensagens enviadas hoje.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.agents.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum atendente ainda.</p>
              )}
              {data.agents.map((a) => (
                <div key={a.id} className="flex items-center gap-2.5">
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[a.status])}
                    title={STATUS_LABEL[a.status]}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                  <span className="text-sm font-medium" title="Mensagens enviadas hoje">
                    {a.messagesSentToday}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Laboratório + Canais */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-1.5 text-base">
                <FlaskConical className="h-4 w-4" /> Laboratório
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Score</p>
                <p className="text-lg font-medium">
                  {data.lab.score ?? "—"}
                  {data.lab.delta != null && (
                    <span
                      className={cn(
                        "ml-1.5 text-xs font-normal",
                        data.lab.delta >= 0 ? "text-success" : "text-destructive"
                      )}
                    >
                      {data.lab.delta >= 0 ? "+" : ""}
                      {data.lab.delta} vs anterior
                    </span>
                  )}
                </p>
              </div>
              <div className="rounded-md border bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Handoffs hoje</p>
                <p className="text-lg font-medium">{data.lab.handoffsToday}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-1.5 text-base">
                <Wifi className="h-4 w-4" /> Canais ativos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <ChannelRow
                label="API Oficial Meta"
                connected={data.channels.official.connected}
                total={data.channels.official.total}
                messages={data.channels.official.messages}
                pct={totalChannelMsgs > 0 ? Math.round((data.channels.official.messages / totalChannelMsgs) * 100) : 0}
              />
              <ChannelRow
                label="WhatsApp Web"
                connected={data.channels.unofficial.connected}
                total={data.channels.unofficial.total}
                messages={data.channels.unofficial.messages}
                pct={totalChannelMsgs > 0 ? Math.round((data.channels.unofficial.messages / totalChannelMsgs) * 100) : 0}
              />
            </CardContent>
          </Card>
        </div>

        {/* Pipeline resumido */}
        {data.pipeline.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-1.5 text-base">
                <ListChecks className="h-4 w-4" /> Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {data.pipeline.map((s) => (
                  <div
                    key={s.stageId}
                    className="flex-1 rounded-md border bg-secondary/30 px-3 py-2 text-center"
                    style={{ minWidth: 90 }}
                  >
                    <p className="truncate text-xs text-muted-foreground">{s.name}</p>
                    <p className={cn("text-lg font-medium", STAGE_COLOR[s.kind] ?? "")}>
                      {s.count}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Departamentos (detalhe) */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.departments.map((d) => (
            <DepartmentCard key={d.id ?? "none"} department={d} />
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "warning" | "destructive";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon} {label}
        </div>
        <p
          className={cn(
            "mt-1.5 text-2xl font-medium leading-none",
            tone === "warning" && "text-warning",
            tone === "destructive" && "text-destructive"
          )}
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ChannelRow({
  label,
  connected,
  total,
  messages,
  pct,
}: {
  label: string;
  connected: number;
  total: number;
  messages: number;
  pct: number;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex-1 truncate">{label}</span>
      <span className="text-xs text-muted-foreground">
        {connected}/{total} número(s)
      </span>
      <span className="w-10 text-right font-medium">{messages}</span>
      <span className="w-10 text-right text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}

function DepartmentCard({ department: d }: { department: DepartmentMetrics }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{d.name}</CardTitle>
        <CardDescription className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" /> {d.memberCount} membro(s)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Wifi className="h-3.5 w-3.5" /> Canais
          </span>
          <span>
            {d.officialConnected}/{d.officialChannels} oficial ·{" "}
            {d.unofficialConnected}/{d.unofficialChannels} WhatsApp Web
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <MessageCircle className="h-3.5 w-3.5" /> Conversas
          </span>
          <span>{d.openConversations} abertas</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Aguardando humano</span>
          <Badge variant={d.handoffPending > 0 ? "warning" : "secondary"}>
            {d.handoffPending}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Não lidas</span>
          <Badge variant={d.unreadTotal > 0 ? "default" : "secondary"}>{d.unreadTotal}</Badge>
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Bot className="h-3.5 w-3.5" /> Agente IA
          </span>
          <span className="truncate">{d.agentProfileName ?? "Nenhum"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
