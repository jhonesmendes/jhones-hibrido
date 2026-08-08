"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import type { TemplateDto } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HelpLink } from "@/components/docs/help-link";

const STATUS_BADGE: Record<
  TemplateDto["status"],
  { label: string; variant: "secondary" | "warning" | "success" | "destructive" }
> = {
  draft: { label: "Rascunho", variant: "secondary" },
  pending: { label: "Pendente na Meta", variant: "warning" },
  approved: { label: "Aprovado", variant: "success" },
  rejected: { label: "Rejeitado", variant: "destructive" },
};

type ChannelOption = {
  id: string;
  name: string;
  displayPhoneNumber: string | null;
  wabaId: string;
  isActive: boolean;
  status: "connected" | "reconnect_required";
};

type DepartmentOption = { id: string; name: string };

function channelLabel(c: ChannelOption): string {
  return c.displayPhoneNumber ? `${c.name} · ${c.displayPhoneNumber}` : c.name;
}

export function TemplatesClient() {
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const [tRes, cRes, dRes] = await Promise.all([
      fetch("/api/templates").catch(() => null),
      fetch("/api/settings/whatsapp/numbers").catch(() => null),
      fetch("/api/settings/departments").catch(() => null),
    ]);
    if (tRes?.ok) {
      const data = (await tRes.json()) as { templates: TemplateDto[] };
      setTemplates(data.templates);
    }
    if (cRes?.ok) {
      const data = (await cRes.json()) as { numbers: ChannelOption[] };
      setChannels(data.numbers);
    }
    if (dRes?.ok) {
      const data = (await dRes.json()) as { departments: DepartmentOption[] };
      setDepartments(data.departments);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function sync() {
    setSyncing(true);
    setSyncMsg(null);
    const res = await fetch("/api/templates/sync", { method: "POST" }).catch(
      () => null
    );
    setSyncing(false);
    if (res?.ok) {
      const data = (await res.json()) as { updated: number };
      setSyncMsg(
        data.updated > 0
          ? `${data.updated} modelo(s) atualizado(s)`
          : "Tudo em dia"
      );
      void refetch();
    } else {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setSyncMsg(data?.error?.message ?? "Não foi possível sincronizar");
    }
  }

  async function remove(t: TemplateDto) {
    if (!confirm(`Excluir o modelo "${t.name}"? Isso apaga na Meta também e não pode ser desfeito.`)) {
      return;
    }
    setDeletingId(t.id);
    const res = await fetch(`/api/templates/${t.id}`, { method: "DELETE" }).catch(() => null);
    setDeletingId(null);
    if (res?.ok) void refetch();
    else {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      alert(data?.error?.message ?? "Não foi possível excluir o modelo");
    }
  }

  async function changeDepartment(t: TemplateDto, departmentId: string | null) {
    const res = await fetch(`/api/templates/${t.id}/assignment`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ departmentId }),
    }).catch(() => null);
    if (res?.ok) void refetch();
    else alert("Não foi possível mudar o departamento do modelo");
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Os modelos permitem reabrir conversas com a janela de 24 h fechada.
          A Meta aprova em horas ou dias; o status atualiza por webhook e pelo
          botão Sincronizar (indispensável no modo agência, onde os eventos de
          modelos não chegam ao webhook da instância).
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <HelpLink slug="modelos" />
          <Button variant="outline" size="sm" disabled={syncing} onClick={() => void sync()}>
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
        </div>
      </div>
      {syncMsg && <p className="text-xs text-muted-foreground">{syncMsg}</p>}

      <CreateForm channels={channels} departments={departments} onCreated={() => void refetch()} />

      <div className="space-y-2">
        {templates.map((t) => {
          const channel = channels.find((c) => c.id === t.credentialId) ?? null;
          return editingId === t.id ? (
            <EditForm
              key={t.id}
              template={t}
              onSaved={() => {
                setEditingId(null);
                void refetch();
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={t.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-sm font-medium">
                  {t.name}{" "}
                  <span className="text-muted-foreground">({t.language})</span>
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={STATUS_BADGE[t.status].variant}>
                    {STATUS_BADGE[t.status].label}
                  </Badge>
                  {t.status === "rejected" && (
                    <>
                      <button
                        onClick={() => setEditingId(t.id)}
                        aria-label="Editar modelo"
                        title="Editar e reenviar para aprovação"
                        className="rounded-md border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void remove(t)}
                        disabled={deletingId === t.id}
                        aria-label="Excluir modelo"
                        title="Excluir modelo"
                        className="rounded-md border p-1.5 text-muted-foreground hover:border-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t.body}</p>
              {t.status === "rejected" && t.rejectionReason && (
                <p className="mt-2 text-xs text-destructive">
                  Motivo da rejeição: {t.rejectionReason}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3 text-xs">
                <span className="text-muted-foreground">
                  Número: {channel ? channelLabel(channel) : "—"}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Departamento:</span>
                  <select
                    value={t.departmentId ?? ""}
                    onChange={(e) =>
                      void changeDepartment(t, e.target.value || null)
                    }
                    className="h-7 rounded-md border border-input bg-card px-1.5 text-xs"
                  >
                    <option value="">Todos os departamentos</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          );
        })}
        {templates.length === 0 && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum modelo ainda. Crie o primeiro acima — por exemplo um
            «seguimos à disposição, retomamos seu orçamento?» para conversas
            frias.
          </p>
        )}
      </div>
    </div>
  );
}

function CreateForm({
  channels,
  departments,
  onCreated,
}: {
  channels: ChannelOption[];
  departments: DepartmentOption[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("pt_BR");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING">("UTILITY");
  const [body, setBody] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usableChannels = channels.filter((c) => c.isActive);

  async function create() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        language,
        category,
        body,
        credentialId,
        departmentId: departmentId || null,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Não foi possível criar o modelo");
      return;
    }
    setName("");
    setBody("");
    onCreated();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Novo modelo</CardTitle>
        <CardDescription>
          Variáveis <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code>… sequenciais,
          sem pular números. É enviado para aprovação da Meta ao criar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {usableChannels.length === 0 ? (
          <p className="text-sm text-destructive">
            Conecte um número em Configurações → Canais antes de criar modelos.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-channel">
                Número (o modelo é registrado nessa WABA)
              </Label>
              <select
                id="tpl-channel"
                value={credentialId}
                onChange={(e) => setCredentialId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">Escolha o número…</option>
                {usableChannels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {channelLabel(c)}
                    {c.status === "reconnect_required" ? " (reconectar)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-dept">Departamento (opcional)</Label>
              <select
                id="tpl-dept"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">Todos os departamentos</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Nome</Label>
            <Input
              id="tpl-name"
              placeholder="acompanhamento_orcamento"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-lang">Idioma</Label>
            <select
              id="tpl-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="pt_BR">pt_BR</option>
              <option value="es_MX">es_MX</option>
              <option value="es">es</option>
              <option value="en_US">en_US</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-cat">Categoria</Label>
            <select
              id="tpl-cat"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as "UTILITY" | "MARKETING")
              }
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="UTILITY">UTILITY (acompanhamento)</option>
              <option value="MARKETING">MARKETING</option>
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tpl-body">Corpo</Label>
          <Textarea
            id="tpl-body"
            rows={3}
            placeholder="Olá {{1}}, seguimos à disposição. Retomamos seu orçamento?"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          disabled={saving || !name.trim() || !body.trim() || !credentialId}
          onClick={() => void create()}
        >
          {saving ? "Enviando à Meta…" : "Criar e enviar para aprovação"}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Edição de modelo rejeitado — nome/idioma são fixos na Meta (só dá pra
 * mudar categoria e corpo), reenvia pra revisão ao salvar. */
function EditForm({
  template,
  onSaved,
  onCancel,
}: {
  template: TemplateDto;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<"UTILITY" | "MARKETING">(
    template.category === "MARKETING" ? "MARKETING" : "UTILITY"
  );
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/templates/${template.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category, body }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Não foi possível salvar as alterações");
      return;
    }
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-sm">
          Editando {template.name}{" "}
          <span className="font-sans text-muted-foreground">({template.language})</span>
        </CardTitle>
        <CardDescription>
          Nome e idioma não podem mudar — só categoria e corpo. Salvar reenvia
          pra revisão da Meta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="tpl-edit-cat">Categoria</Label>
          <select
            id="tpl-edit-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value as "UTILITY" | "MARKETING")}
            className="flex h-9 w-full max-w-xs rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="UTILITY">UTILITY (acompanhamento)</option>
            <option value="MARKETING">MARKETING</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tpl-edit-body">Corpo</Label>
          <Textarea
            id="tpl-edit-body"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button disabled={saving || !body.trim()} onClick={() => void save()}>
            {saving ? "Reenviando à Meta…" : "Salvar e reenviar para aprovação"}
          </Button>
          <Button variant="outline" disabled={saving} onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
