"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HelpLink } from "@/components/docs/help-link";

type Profile = {
  id: string;
  enabled: boolean;
  name: string;
  tone: string | null;
  instructions: string | null;
  escalationRules: string | null;
  greeting: string | null;
};

type KbEntry = {
  id: string;
  kind: "qa" | "block";
  question: string | null;
  answer: string | null;
  content: string | null;
  departmentId: string | null;
};

type Department = { id: string; name: string };

/**
 * v0.1 (Etapa 6): N perfis de agente reutilizáveis por organização, não
 * mais 1 só. Cada perfil pode ser o padrão de um departamento
 * (Configurações → Departamentos) e/ou de um atendente (Configurações →
 * Equipe) — a conversa resolve pela cadeia: override manual > atendente >
 * departamento > perfil mais antigo ativo da org.
 */
export function AgentClient() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [kbSize, setKbSize] = useState<{ chars: number; warnAt: number; warning: boolean } | null>(null);
  const [creating, setCreating] = useState(false);

  const refetch = useCallback(async () => {
    const [p, kb, size, d] = await Promise.all([
      fetch("/api/agent/profiles").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/kb").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/kb/size").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/settings/departments").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null, null, null]);
    if (p) {
      setProfiles(p.profiles);
      setAiConfigured(p.aiConfigured);
    }
    if (kb) setEntries(kb.entries);
    if (size) setKbSize(size);
    if (d) setDepartments(d.departments);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!profiles) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-1.5">
          <h2 className="font-semibold">Agentes de IA</h2>
          <HelpLink slug="agente" />
        </div>
      </header>

      {!aiConfigured && (
        <div className="mx-6 mt-6 rounded-lg border border-brand-soft bg-brand-tint p-6 text-center">
          <Sparkles className="mx-auto mb-2 h-8 w-8 text-primary" />
          <p className="font-medium">Configure seu provedor de IA para ativar os agentes</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Configure em{" "}
            <Link href="/settings/ai" className="text-primary hover:underline">
              Configurações → Inteligência IA
            </Link>
            , ou adicione <code className="rounded bg-secondary px-1">OPENROUTER_API_TOKEN</code>{" "}
            e <code className="rounded bg-secondary px-1">OPENROUTER_MODEL</code> às variáveis de
            ambiente da instância e reinicie. Enquanto isso, você pode deixar prontos os
            perfis e o conhecimento aqui embaixo.
          </p>
        </div>
      )}

      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <div className="space-y-3">
          {profiles.map((p) => (
            <ProfileCard key={p.id} profile={p} onChanged={() => void refetch()} />
          ))}

          {profiles.length === 0 && !creating && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum perfil de agente ainda.
            </p>
          )}

          {creating ? (
            <CreateProfileForm
              onCreated={() => {
                setCreating(false);
                void refetch();
              }}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <Button variant="outline" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Novo perfil
            </Button>
          )}
        </div>

        <KbSection
          entries={entries}
          departments={departments}
          kbSize={kbSize}
          onChanged={() => void refetch()}
        />
      </div>
    </div>
  );
}

function CreateProfileForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/agent/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Não foi possível criar o perfil");
      return;
    }
    onCreated();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Novo perfil</CardTitle>
        <CardDescription>
          Ex.: &ldquo;Bob Comercial&rdquo;, &ldquo;Bob Suporte&rdquo; — dê um
          nome e depois atribua a um departamento ou atendente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-agent-name">Nome</Label>
          <Input id="new-agent-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button disabled={saving || !name.trim()} onClick={() => void create()}>
            {saving ? "Criando…" : "Criar perfil"}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileCard({
  profile: p,
  onChanged,
}: {
  profile: Profile;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState(p);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(p), [p]);

  async function save() {
    setSaving(true);
    await fetch(`/api/agent/profiles/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        tone: form.tone,
        instructions: form.instructions,
        escalationRules: form.escalationRules,
        greeting: form.greeting,
      }),
    }).catch(() => null);
    setSaving(false);
    onChanged();
  }

  async function toggleEnabled() {
    setBusy(true);
    await fetch(`/api/agent/profiles/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !p.enabled }),
    }).catch(() => null);
    setBusy(false);
    onChanged();
  }

  async function remove() {
    if (!confirm(`Remover o perfil "${p.name}"? Departamentos/atendentes que o usam voltam a não ter perfil padrão.`))
      return;
    setBusy(true);
    await fetch(`/api/agent/profiles/${p.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    onChanged();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{p.name}</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={p.enabled ? "success" : "outline"}>
            {p.enabled ? "Ativo" : "Inativo"}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            aria-label={expanded ? "Recolher" : "Editar"}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4 border-t pt-4">
          <div className="space-y-1.5">
            <Label>Nome do agente</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Tom</Label>
            <Input
              placeholder="ex.: próximo e direto, com você"
              value={form.tone ?? ""}
              onChange={(e) => setForm({ ...form, tone: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Instruções</Label>
            <Textarea
              rows={5}
              placeholder="O que o agente deve e não deve fazer…"
              value={form.instructions ?? ""}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Regras de escalonamento</Label>
            <Textarea
              rows={3}
              placeholder="Quando passar a conversa para um humano…"
              value={form.escalationRules ?? ""}
              onChange={(e) => setForm({ ...form, escalationRules: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Saudação</Label>
            <Input
              placeholder="Saudação para conversas novas"
              value={form.greeting ?? ""}
              onChange={(e) => setForm({ ...form, greeting: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <div className="flex gap-2">
              <Button size="sm" disabled={saving || !form.name.trim()} onClick={() => void save()}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void toggleEnabled()}>
                {p.enabled ? "Desativar" : "Ativar"}
              </Button>
            </div>
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
        </CardContent>
      )}
    </Card>
  );
}

function DepartmentSelect({
  value,
  departments,
  onChange,
}: {
  value: string | null;
  departments: Department[];
  onChange: (departmentId: string | null) => void;
}) {
  if (departments.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <Label>Departamento</Label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
      >
        <option value="">Geral — vale pra qualquer conversa</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function KbSection({
  entries,
  departments,
  kbSize,
  onChanged,
}: {
  entries: KbEntry[];
  departments: Department[];
  kbSize: { chars: number; warnAt: number; warning: boolean } | null;
  onChanged: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [qaDepartmentId, setQaDepartmentId] = useState<string | null>(null);
  const [block, setBlock] = useState("");
  const [blockDepartmentId, setBlockDepartmentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const departmentName = (id: string | null) =>
    id ? (departments.find((d) => d.id === id)?.name ?? null) : null;

  async function addQa() {
    if (!question.trim() || !answer.trim()) return;
    await fetch("/api/kb", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "qa", question, answer, departmentId: qaDepartmentId }),
    }).catch(() => null);
    setQuestion("");
    setAnswer("");
    setQaDepartmentId(null);
    onChanged();
  }

  async function addBlock() {
    if (!block.trim()) return;
    await fetch("/api/kb", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "block", content: block, departmentId: blockDepartmentId }),
    }).catch(() => null);
    setBlock("");
    setBlockDepartmentId(null);
    onChanged();
  }

  async function remove(id: string) {
    await fetch(`/api/kb/${id}`, { method: "DELETE" }).catch(() => null);
    onChanged();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Knowledge base</CardTitle>
            <CardDescription>
              A única fonte de verdade do agente: o que não está aqui, ele não
              afirma. Entradas &ldquo;gerais&rdquo; valem pra qualquer perfil;
              entradas de um departamento só entram no contexto de conversas
              desse departamento.
            </CardDescription>
          </div>
          {kbSize && (
            <Badge variant={kbSize.warning ? "warning" : "secondary"}>
              {kbSize.chars.toLocaleString("pt-BR")} caracteres
            </Badge>
          )}
        </div>
        {kbSize?.warning && (
          <p className="text-xs text-[#8a6d3b]">
            O conhecimento está se aproximando do limite de contexto do modelo
            (a v1 injeta tudo em cada turno). Considere enxugar as entradas.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Nova pergunta / resposta</p>
          <Input
            placeholder="Pergunta (ex.: Vocês fazem entrega?)"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Textarea
            placeholder="Resposta"
            rows={2}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <DepartmentSelect
            value={qaDepartmentId}
            departments={departments}
            onChange={setQaDepartmentId}
          />
          <Button
            size="sm"
            onClick={() => void addQa()}
            disabled={!question.trim() || !answer.trim()}
          >
            <Plus className="h-4 w-4" /> Adicionar P/R
          </Button>
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Novo bloco de texto livre</p>
          <Textarea
            placeholder="Horários, endereços, políticas…"
            rows={3}
            value={block}
            onChange={(e) => setBlock(e.target.value)}
          />
          <DepartmentSelect
            value={blockDepartmentId}
            departments={departments}
            onChange={setBlockDepartmentId}
          />
          <Button size="sm" onClick={() => void addBlock()} disabled={!block.trim()}>
            <Plus className="h-4 w-4" /> Adicionar bloco
          </Button>
        </div>

        <ul className="space-y-2">
          {entries.map((e) =>
            editingId === e.id ? (
              <KbEntryEditForm
                key={e.id}
                entry={e}
                departments={departments}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  onChanged();
                }}
              />
            ) : (
              <li key={e.id} className="flex items-start gap-2 rounded-md border p-3">
                <div className="min-w-0 flex-1 text-sm">
                  {e.kind === "qa" ? (
                    <>
                      <p className="font-medium">{e.question}</p>
                      <p className="mt-0.5 text-muted-foreground">{e.answer}</p>
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap text-muted-foreground">{e.content}</p>
                  )}
                  <Badge variant="secondary" className="mt-1.5">
                    {departmentName(e.departmentId) ?? "Geral"}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Editar entrada"
                  onClick={() => setEditingId(e.id)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Excluir entrada"
                  onClick={() => void remove(e.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            )
          )}
          {entries.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Nenhuma entrada ainda: adicione o que o agente precisa saber.
            </p>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function KbEntryEditForm({
  entry,
  departments,
  onCancel,
  onSaved,
}: {
  entry: KbEntry;
  departments: Department[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [question, setQuestion] = useState(entry.question ?? "");
  const [answer, setAnswer] = useState(entry.answer ?? "");
  const [content, setContent] = useState(entry.content ?? "");
  const [departmentId, setDepartmentId] = useState<string | null>(entry.departmentId);
  const [saving, setSaving] = useState(false);

  const valid = entry.kind === "qa" ? question.trim() && answer.trim() : content.trim();

  async function save() {
    setSaving(true);
    await fetch(`/api/kb/${entry.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        entry.kind === "qa" ? { question, answer, departmentId } : { content, departmentId }
      ),
    }).catch(() => null);
    setSaving(false);
    onSaved();
  }

  return (
    <li className="space-y-2 rounded-md border border-brand-soft bg-brand-tint/40 p-3">
      {entry.kind === "qa" ? (
        <>
          <Input
            placeholder="Pergunta"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Textarea
            placeholder="Resposta"
            rows={2}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </>
      ) : (
        <Textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
      )}
      <DepartmentSelect value={departmentId} departments={departments} onChange={setDepartmentId} />
      <div className="flex gap-2">
        <Button size="sm" disabled={!valid || saving} onClick={() => void save()}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </li>
  );
}
