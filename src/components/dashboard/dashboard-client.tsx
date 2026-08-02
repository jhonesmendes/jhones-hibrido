"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Bot, MessageCircle, Users, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

/**
 * Dashboard (v0.1, Etapa 7) — owner vê todos os departamentos + o que
 * ainda não tem departamento; admin vê só os departamentos aos quais
 * pertence (`GET /api/settings/departments` já escopa isso, mesmo padrão
 * do seletor da sidebar). Agente comum não tem acesso (403; o link nem
 * aparece no menu). O seletor abaixo restringe a visão a 1 departamento —
 * "Todos" mostra um card por departamento visível de uma vez.
 */
export function DashboardClient() {
  const [data, setData] = useState<{
    departments: DepartmentMetrics[];
    alerts: DashboardAlert[];
  } | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    fetch("/api/settings/departments")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { departments: Department[] } | null) => setDepartments(d?.departments ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const url = selectedId
      ? `/api/dashboard?departmentId=${encodeURIComponent(selectedId)}`
      : "/api/dashboard";
    fetch(url)
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
  }, [selectedId]);

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

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Visão consolidada dos departamentos que você acessa.
          </p>
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.departments.map((d) => (
            <DepartmentCard key={d.id ?? "none"} department={d} />
          ))}
        </div>
      </div>
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
