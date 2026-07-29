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

const ACTION_LABEL: Record<string, string> = {
  "user.login": "Login",
  "invite.created": "Convite gerado",
  "invite.used": "Convite utilizado",
  "channel.connected": "Canal conectado",
  "channel.disconnected": "Canal desconectado",
  "campaign.sent": "Campanha disparada",
  "settings.permissions_changed": "Permissões alteradas",
  "settings.role_changed": "Membro alterado",
  "settings.smtp_changed": "SMTP alterado",
};

export function AuditClient() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [memberFilter, setMemberFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const refetch = useCallback(async () => {
    const params = new URLSearchParams();
    if (memberFilter.trim()) params.set("memberId", memberFilter.trim());
    if (actionFilter.trim()) params.set("action", actionFilter.trim());
    const res = await fetch(`/api/settings/audit?${params.toString()}`).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { entries: AuditEntry[] };
    setEntries(data.entries);
  }, [memberFilter, actionFilter]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Auditoria</CardTitle>
            <HelpLink slug="auditoria" />
          </div>
          <CardDescription>Ações críticas da organização.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
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
        </CardContent>
      </Card>

      <div className="space-y-2">
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
      </div>
    </div>
  );
}
