"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DepartmentQueueSettings, type QueueDepartment } from "@/components/settings/department-queue-settings";

type Department = QueueDepartment & {
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  isActive: boolean;
  agentProfileId: string | null;
};

type TeamMember = { id: string; name: string; email: string; role: string };

type DeptMember = { memberId: string; role: "admin" | "agent"; name: string; email: string };

type AgentProfile = { id: string; name: string };

export function DepartmentsClient() {
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [creating, setCreating] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/departments").catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { departments: Department[] };
      setDepartments(data.departments);
    }
  }, []);

  useEffect(() => {
    void refetch();
    fetch("/api/settings/team")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { members: TeamMember[] } | null) => {
        if (data) setTeam(data.members);
      })
      .catch(() => null);
    fetch("/api/agent/profiles")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { profiles: AgentProfile[] } | null) => {
        if (data) setAgentProfiles(data.profiles);
      })
      .catch(() => null);
  }, [refetch]);

  if (!departments) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Departamentos são equipes com número próprio, pipeline e agente IA
        próprios — o terceiro nível de escopo entre a organização e o
        indivíduo. Vincule números em Configurações → Canais depois de criar
        o departamento.
      </p>

      <div className="space-y-3">
        {departments.map((d) => (
          <DepartmentCard
            key={d.id}
            department={d}
            team={team}
            agentProfiles={agentProfiles}
            onChanged={() => void refetch()}
          />
        ))}

        {departments.length === 0 && !creating && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum departamento ainda. Sem departamentos, a organização
            continua funcionando como hoje — todos veem tudo.
          </p>
        )}

        {creating ? (
          <CreateForm
            onCreated={() => {
              setCreating(false);
              void refetch();
            }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <Button variant="outline" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo departamento
          </Button>
        )}
      </div>
    </div>
  );
}

function CreateForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/settings/departments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description: description.trim() || undefined }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Não foi possível criar o departamento");
      return;
    }
    onCreated();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Novo departamento</CardTitle>
        <CardDescription>Ex.: Comercial, Suporte, Cobrança…</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="dept-name">Nome</Label>
          <Input id="dept-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dept-desc">Descrição (opcional)</Label>
          <Textarea
            id="dept-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button disabled={saving || !name.trim()} onClick={() => void create()}>
            {saving ? "Criando…" : "Criar departamento"}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DepartmentCard({
  department: d,
  team,
  agentProfiles,
  onChanged,
}: {
  department: Department;
  team: TeamMember[];
  agentProfiles: AgentProfile[];
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(d.name);
  const [description, setDescription] = useState(d.description ?? "");
  const [members, setMembers] = useState<DeptMember[] | null>(null);
  const [addMemberId, setAddMemberId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    const res = await fetch(`/api/settings/departments/${d.id}/members`).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { members: DeptMember[] };
      setMembers(data.members);
    }
  }, [d.id]);

  useEffect(() => {
    if (expanded && members === null) void loadMembers();
  }, [expanded, members, loadMembers]);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/settings/departments/${d.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description: description.trim() || null }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Não foi possível salvar");
      return;
    }
    onChanged();
  }

  async function setAgentProfile(agentProfileId: string) {
    setBusy(true);
    await fetch(`/api/settings/departments/${d.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentProfileId: agentProfileId || null }),
    }).catch(() => null);
    setBusy(false);
    onChanged();
  }

  async function toggleQueue() {
    setBusy(true);
    await fetch(`/api/settings/departments/${d.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queueEnabled: !d.queueEnabled }),
    }).catch(() => null);
    setBusy(false);
    onChanged();
  }

  async function setRoutingMode(routingMode: "automatic" | "client-selection") {
    setBusy(true);
    await fetch(`/api/settings/departments/${d.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ routingMode }),
    }).catch(() => null);
    setBusy(false);
    onChanged();
  }

  async function toggleActive() {
    setBusy(true);
    await fetch(`/api/settings/departments/${d.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !d.isActive }),
    }).catch(() => null);
    setBusy(false);
    onChanged();
  }

  async function remove() {
    if (!confirm(`Remover o departamento "${d.name}"? Números/conversas vinculados voltam a não ter departamento.`))
      return;
    setBusy(true);
    await fetch(`/api/settings/departments/${d.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    onChanged();
  }

  async function addMember() {
    if (!addMemberId) return;
    setBusy(true);
    await fetch(`/api/settings/departments/${d.id}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memberId: addMemberId, role: "agent" }),
    }).catch(() => null);
    setAddMemberId("");
    setBusy(false);
    void loadMembers();
  }

  async function removeMember(memberId: string) {
    setBusy(true);
    await fetch(`/api/settings/departments/${d.id}/members/${memberId}`, {
      method: "DELETE",
    }).catch(() => null);
    setBusy(false);
    void loadMembers();
  }

  async function setMemberRole(memberId: string, role: "admin" | "agent") {
    setBusy(true);
    await fetch(`/api/settings/departments/${d.id}/members/${memberId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    }).catch(() => null);
    setBusy(false);
    void loadMembers();
  }

  const availableToAdd = team.filter(
    (t) => !members?.some((m) => m.memberId === t.id)
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">{d.name}</CardTitle>
          <CardDescription>{d.description || d.slug}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {!d.isActive && <Badge variant="outline">Inativo</Badge>}
          <Button
            variant="ghost"
            size="icon"
            aria-label={expanded ? "Recolher" : "Expandir"}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-5 border-t pt-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          {agentProfiles.length > 0 && (
            <div className="space-y-1.5">
              <Label>Agente IA padrão</Label>
              <select
                value={d.agentProfileId ?? ""}
                disabled={busy}
                onChange={(e) => void setAgentProfile(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">Nenhum</option>
                {agentProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Usado quando a conversa não tem atendente com perfil próprio
                nem override manual.
              </p>
            </div>
          )}
          <DepartmentQueueSettings
            department={d}
            onToggleQueue={toggleQueue}
            onSetRoutingMode={setRoutingMode}
            onChanged={onChanged}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy || !name.trim()} onClick={() => void save()}>
              Salvar
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void toggleActive()}>
              {d.isActive ? "Desativar" : "Reativar"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remover
            </Button>
          </div>

          <div className="space-y-2 border-t pt-4">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Users className="h-4 w-4" /> Membros
            </p>
            {members?.map((m) => (
              <div
                key={m.memberId}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {m.name} <span className="text-muted-foreground">({m.email})</span>
                </span>
                <select
                  value={m.role}
                  disabled={busy}
                  onChange={(e) => void setMemberRole(m.memberId, e.target.value as "admin" | "agent")}
                  className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                >
                  <option value="agent">Agente</option>
                  <option value="admin">Admin do dept.</option>
                </select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remover do departamento"
                  disabled={busy}
                  onClick={() => void removeMember(m.memberId)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {members?.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum membro neste departamento ainda.</p>
            )}
            {availableToAdd.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <select
                  value={addMemberId}
                  onChange={(e) => setAddMemberId(e.target.value)}
                  className="h-8 flex-1 rounded-md border border-input bg-card px-2 text-xs"
                >
                  <option value="">Adicionar membro…</option>
                  {availableToAdd.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.email})
                    </option>
                  ))}
                </select>
                <Button size="sm" disabled={!addMemberId || busy} onClick={() => void addMember()}>
                  Adicionar
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
