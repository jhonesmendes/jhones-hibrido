"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronUp,
  LogOut,
  Pencil,
  Plus,
  QrCode,
  Trash2,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEvents } from "@/components/use-events";

type Department = { id: string; name: string };

type UnofficialChannel = {
  id: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  isActive: boolean;
  status: "disconnected" | "connecting" | "connected";
  qrCode: string | null;
  phoneNumber: string | null;
};

/**
 * Tela de canais não oficiais — v0.1: lista de N canais (motor Baileys
 * nativo, sem gateway de terceiros), cada um com sua própria sessão/QR.
 * Estado ao vivo por SSE (evento `channel.status`, com `channelId`).
 */
export function ChannelsClient() {
  const [channels, setChannels] = useState<UnofficialChannel[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [creating, setCreating] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/channels/unofficial").catch(() => null);
    if (res?.status === 403) {
      setForbidden(true);
      return;
    }
    if (res?.ok) {
      const data = (await res.json()) as { channels: UnofficialChannel[] };
      setChannels(data.channels);
    }
  }, []);

  useEffect(() => {
    void refetch();
    fetch("/api/settings/departments")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { departments: Department[] } | null) => setDepartments(d?.departments ?? []))
      .catch(() => {});
  }, [refetch]);

  useEvents({
    onChannelStatus: (data) =>
      setChannels((prev) =>
        prev
          ? prev.map((c) =>
              c.id === data.channelId
                ? {
                    ...c,
                    status: data.status,
                    qrCode: data.qrCode,
                    phoneNumber: data.phoneNumber ?? c.phoneNumber,
                  }
                : c
            )
          : prev
      ),
  });

  if (forbidden) {
    return (
      <p className="text-sm text-muted-foreground">
        Canais são configuração da organização — só owner e administradores
        podem ver e gerenciar os números conectados.
      </p>
    );
  }

  if (!channels) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start gap-2 rounded-lg border border-[#ece2cf] bg-[#faf7f0] p-4 text-sm text-[#8a6d3b]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong>WhatsApp Web</strong> — motor próprio do Vocero, conexão
          direta ao WhatsApp (sem gateway de terceiros). A Meta pode banir o
          número: use um secundário, não o principal do negócio. No modelo
          híbrido, a captação entra pela Cloud API oficial e a automação
          opera por estes números.
        </p>
      </div>

      <div className="space-y-3">
        {channels.map((c) => (
          <ChannelCard
            key={c.id}
            channel={c}
            departments={departments}
            onChanged={() => void refetch()}
          />
        ))}

        {channels.length === 0 && !creating && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum número do WhatsApp Web conectado ainda.
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
            <Plus className="mr-1.5 h-4 w-4" /> Adicionar número
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/settings/channels/unofficial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() || undefined }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Não foi possível criar o canal");
      return;
    }
    onCreated();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Novo número</CardTitle>
        <CardDescription>
          Dê um nome para identificar este número (ex.: Comercial, Suporte).
          Depois de criado, conecte escaneando o QR.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="channel-name">Nome</Label>
          <Input
            id="channel-name"
            placeholder="WhatsApp"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button disabled={saving} onClick={() => void create()}>
            {saving ? "Criando…" : "Criar canal"}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ChannelCard({
  channel: c,
  departments,
  onChanged,
}: {
  channel: UnofficialChannel;
  departments: Department[];
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(c.status !== "connected");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [busy, setBusy] = useState(false);

  async function connect() {
    setConnecting(true);
    await fetch(`/api/settings/channels/unofficial/${c.id}/connect`, {
      method: "POST",
    }).catch(() => null);
    setConnecting(false);
  }

  async function disconnect() {
    if (
      !confirm(
        "Desconectar este número? Será preciso escanear um QR novo para reconectar."
      )
    ) {
      return;
    }
    setDisconnecting(true);
    await fetch(`/api/settings/channels/unofficial/${c.id}/disconnect`, {
      method: "POST",
    }).catch(() => null);
    setDisconnecting(false);
    onChanged();
  }

  async function remove() {
    if (!confirm(`Remover o número "${c.name}"? Isso não pode ser desfeito.`)) return;
    setBusy(true);
    await fetch(`/api/settings/channels/unofficial/${c.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setBusy(false);
    onChanged();
  }

  async function toggleActive() {
    setBusy(true);
    await fetch(`/api/settings/channels/unofficial/${c.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !c.isActive }),
    }).catch(() => null);
    setBusy(false);
    onChanged();
  }

  async function setDepartment(departmentId: string) {
    setBusy(true);
    await fetch(`/api/settings/channels/unofficial/${c.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ departmentId: departmentId || null }),
    }).catch(() => null);
    setBusy(false);
    onChanged();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <Wifi className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base">{c.name}</CardTitle>
            <CardDescription>
              {c.phoneNumber ? `+${c.phoneNumber}` : "Não conectado"}
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {c.status === "connected" ? (
            <Badge variant="success">Conectado</Badge>
          ) : c.status === "connecting" ? (
            <Badge>Conectando…</Badge>
          ) : (
            <Badge variant="destructive">Desconectado</Badge>
          )}
          {!c.isActive && <Badge variant="outline">Inativo</Badge>}
          <Button
            variant="ghost"
            size="icon"
            aria-label={expanded ? "Recolher" : "Expandir"}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4 border-t pt-4">
          {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}

          {departments.length > 0 && (
            <div className="space-y-1.5">
              <Label>Departamento</Label>
              <select
                value={c.departmentId ?? ""}
                disabled={busy}
                onChange={(e) => void setDepartment(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">Sem departamento (visível à organização toda)</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {c.status === "connected" ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#d8e8dd] bg-[#eff7f1] p-4">
              <p className="text-sm font-medium text-[#3f6b52]">Número conectado</p>
              <Button
                size="sm"
                variant="ghost"
                disabled={disconnecting}
                onClick={() => void disconnect()}
              >
                <LogOut className="h-4 w-4" strokeWidth={1.7} />
                {disconnecting ? "Desconectando…" : "Desconectar"}
              </Button>
            </div>
          ) : (
            <div className="flex items-start gap-4">
              <div className="flex h-44 w-44 shrink-0 items-center justify-center rounded-lg border bg-secondary">
                {c.qrCode ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.qrCode} alt="QR code" className="h-40 w-40" />
                ) : (
                  <QrCode className="h-10 w-10 text-text-3" strokeWidth={1.2} />
                )}
              </div>
              <div className="space-y-3 text-sm text-text-2">
                <p className="font-medium text-foreground">
                  {c.status === "connecting" && c.qrCode
                    ? "Escaneie o QR com o celular deste número"
                    : "Clique em conectar para gerar o QR"}
                </p>
                <p>
                  WhatsApp → Aparelhos conectados → Conectar um aparelho. O
                  status atualiza sozinho, em tempo real.
                </p>
                <div className="flex gap-2">
                  {c.status !== "connecting" && (
                    <Button disabled={connecting} onClick={() => void connect()}>
                      {connecting ? "Iniciando…" : "Conectar"}
                    </Button>
                  )}
                  {c.status === "connecting" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={disconnecting}
                      onClick={() => void disconnect()}
                    >
                      <LogOut className="h-4 w-4" strokeWidth={1.7} />
                      {disconnecting ? "Cancelando…" : "Cancelar / resetar conexão"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t pt-3">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void toggleActive()}>
              {c.isActive ? "Desativar" : "Reativar"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remover número
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
