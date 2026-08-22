"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpLink } from "@/components/docs/help-link";

type AuditEntry = {
  id: string;
  memberId: string | null;
  memberName: string | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  createdAt: string;
};

export const ACTION_LABEL: Record<string, string> = {
  "user.login": "Login",
  "invite.created": "Convite gerado",
  "invite.used": "Convite utilizado",
  "invite.revoked": "Convite revogado",
  "channel.connected": "Canal conectado",
  "channel.disconnected": "Canal desconectado",
  "campaign.sent": "Campanha disparada",
  "settings.permissions_changed": "Permissões alteradas",
  "settings.role_changed": "Membro alterado",
  "settings.smtp_changed": "SMTP alterado",
  "settings.ai_changed": "Configuração de IA alterada",
  "settings.n8n_changed": "Configuração N8N alterada",
  "n8n.workflow_executed": "Workflow N8N executado",
  "n8n.workflow_deleted": "Workflow N8N removido",
  "conversation.deleted": "Conversa removida",
  "department.created": "Departamento criado",
  "department.updated": "Departamento atualizado",
  "department.deleted": "Departamento removido",
  "department.member_added": "Membro adicionado ao departamento",
  "department.member_removed": "Membro removido do departamento",
};

export function AuditClient() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [memberFilter, setMemberFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const buildParams = useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams();
      if (memberFilter.trim()) params.set("memberId", memberFilter.trim());
      if (actionFilter.trim()) params.set("action", actionFilter.trim());
      if (since) params.set("since", new Date(since).toISOString());
      if (until) params.set("until", new Date(`${until}T23:59:59`).toISOString());
      if (cursor) params.set("cursor", cursor);
      return params;
    },
    [memberFilter, actionFilter, since, until]
  );

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/settings/audit?${buildParams().toString()}`).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { entries: AuditEntry[]; nextCursor: string | null };
    setEntries(data.entries);
    setNextCursor(data.nextCursor);
  }, [buildParams]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    const res = await fetch(`/api/settings/audit?${buildParams(nextCursor).toString()}`).catch(() => null);
    setLoadingMore(false);
    if (!res?.ok) return;
    const data = (await res.json()) as { entries: AuditEntry[]; nextCursor: string | null };
    setEntries((prev) => [...prev, ...data.entries]);
    setNextCursor(data.nextCursor);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      <div className="max-w-3xl space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Auditoria</CardTitle>
              <HelpLink slug="auditoria" />
            </div>
            <CardDescription>Ações críticas da organização.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="audit-member">ID do membro</Label>
              <Input
                id="audit-member"
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
                placeholder="opcional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-action">Ação</Label>
              <select
                id="audit-action"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="h-9 w-56 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Todas</option>
                {Object.entries(ACTION_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-since">De</Label>
              <Input id="audit-since" type="date" value={since} onChange={(e) => setSince(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-until">Até</Label>
              <Input id="audit-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 max-w-3xl flex-1 space-y-2 overflow-y-auto pb-6">
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum registro.</p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="rounded-lg border bg-card px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(e.createdAt).toLocaleString("pt-BR")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {e.memberName ?? "sistema"}
              {e.resource && ` · ${e.resource}${e.resourceId ? ` (${e.resourceId})` : ""}`}
              {e.ipAddress && ` · ${e.ipAddress}`}
            </p>
          </div>
        ))}
        {nextCursor && (
          <button
            disabled={loadingMore}
            onClick={() => void loadMore()}
            className="w-full rounded-lg border py-2 text-sm text-muted-foreground hover:bg-secondary/30 disabled:opacity-50"
          >
            {loadingMore ? "Carregando…" : "Carregar mais"}
          </button>
        )}
      </div>
    </div>
  );
}
