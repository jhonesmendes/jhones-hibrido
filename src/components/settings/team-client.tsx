"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Settings2, UserPlus } from "lucide-react";
import { ContactAvatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERMISSIONS, type Permission, type Role } from "@/lib/auth/permissions";

type ChannelAccess = { canView: boolean; canSend: boolean };

type Member = {
  id: string;
  role: Role;
  isActive: boolean;
  name: string;
  email: string;
  createdAt: string;
  permissions: Record<Permission, boolean>;
  channels: { official: ChannelAccess; unofficial: ChannelAccess };
};

const ROLE_LABEL: Record<Role, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  agent: "Agente",
};

export function TeamClient() {
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [inviting, setInviting] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/team").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { members: Member[] };
    setMembers(data.members);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  function generatePassword() {
    const alphabet =
      "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    setTempPassword(
      Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
    );
  }

  async function create() {
    setSaving(true);
    setError(null);
    setCreated(null);
    const res = await fetch("/api/settings/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password: tempPassword }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Não foi possível criar a conta");
      return;
    }
    setCreated({ email, password: tempPassword });
    setName("");
    setEmail("");
    setTempPassword("");
    void refetch();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Criar conta de equipe</CardTitle>
          <CardDescription>
            Sem e-mails: você mesmo compartilha a senha temporária com o
            colega (ela aparece UMA única vez). Prefere mandar um link em vez
            de compartilhar senha?{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setInviting(true)}
            >
              Convidar por link
            </button>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Nome</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-email">E-mail</Label>
              <Input
                id="team-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-password">Senha temporária</Label>
            <div className="flex gap-2">
              <Input
                id="team-password"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                placeholder="mínimo de 8 caracteres"
              />
              <Button variant="outline" onClick={generatePassword}>
                Gerar
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {created && (
            <div className="rounded-md border border-[#d8e8dd] bg-[#eff7f1] p-3 text-sm">
              <p className="font-medium text-[#3f6b52]">Conta criada ✓</p>
              <p className="mt-1 text-[#3f6b52]/90">
                Compartilhe estes dados agora (não serão exibidos de novo):
                <br />
                <code>{created.email}</code> · senha{" "}
                <code>{created.password}</code>
              </p>
            </div>
          )}
          <Button
            disabled={
              saving || !name.trim() || !email.trim() || tempPassword.length < 8
            }
            onClick={() => void create()}
          >
            <UserPlus className="h-4 w-4" />
            {saving ? "Criando…" : "Criar conta"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Membros
        </p>
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <ContactAvatar name={m.name} seed={m.id} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {m.name}
                {!m.isActive && (
                  <span className="ml-2 text-xs text-destructive">
                    (inativo)
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">{m.email}</p>
            </div>
            <Badge variant={m.role === "owner" ? "default" : "secondary"}>
              {ROLE_LABEL[m.role]}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Editar ${m.name}`}
              onClick={() => setEditing(m)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {editing && (
        <EditMemberDialog
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refetch();
          }}
        />
      )}

      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </div>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const [role, setRole] = useState<"admin" | "agent">("agent");
  const [email, setEmail] = useState("");
  const [expiresIn, setExpiresIn] = useState<"24h" | "7d" | "30d">("7d");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/settings/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role,
        email: email.trim() || undefined,
        expiresIn,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Não foi possível gerar o convite");
      return;
    }
    const data = (await res.json()) as { url: string };
    setUrl(data.url);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-semibold">Convidar membro</h3>

        {url ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Link gerado — compartilhe com quem você quer convidar. Ele
              nasce com o papel definido, editável depois em qualquer
              momento.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={url} className="flex-1" />
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(url);
                  setCopied(true);
                }}
              >
                <Link2 className="h-4 w-4" />
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={onClose}>Fechar</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Papel</Label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "agent")}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="agent">Agente</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">
                E-mail (opcional — restringe o convite a este e-mail)
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-expires">Expira em</Label>
              <select
                id="invite-expires"
                value={expiresIn}
                onChange={(e) =>
                  setExpiresIn(e.target.value as "24h" | "7d" | "30d")
                }
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="24h">24 horas</option>
                <option value="7d">7 dias</option>
                <option value="30d">30 dias</option>
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button disabled={saving} onClick={() => void generate()}>
                {saving ? "Gerando…" : "Gerar link"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditMemberDialog({
  member,
  onClose,
  onSaved,
}: {
  member: Member;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState<Role>(member.role);
  const [isActive, setIsActive] = useState(member.isActive);
  const [permissions, setPermissions] = useState<Record<Permission, boolean>>(
    member.permissions
  );
  const [channels, setChannels] = useState(member.channels);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/settings/team/${member.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role, isActive, permissions, channels }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Não foi possível salvar");
      return;
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-semibold">Editar {member.name}</h3>
        <p className="mb-4 text-xs text-muted-foreground">{member.email}</p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-role">Papel</Label>
              <select
                id="edit-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="owner">Proprietário</option>
                <option value="admin">Administrador</option>
                <option value="agent">Agente</option>
              </select>
            </div>
            <div className="flex items-end gap-2 pb-1.5">
              <input
                id="edit-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="edit-active">Conta ativa</Label>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Permissões
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {(Object.entries(PERMISSIONS) as [Permission, string][]).map(
                ([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={permissions[key] ?? false}
                      onChange={(e) =>
                        setPermissions((prev) => ({
                          ...prev,
                          [key]: e.target.checked,
                        }))
                      }
                      className="h-4 w-4"
                    />
                    {label}
                  </label>
                )
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Acesso a canais
            </p>
            {(["official", "unofficial"] as const).map((type) => (
              <div key={type} className="mb-2 flex items-center gap-4 text-sm">
                <span className="w-28 shrink-0">
                  {type === "official" ? "Oficial" : "Não oficial"}
                </span>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={channels[type].canView}
                    onChange={(e) =>
                      setChannels((prev) => ({
                        ...prev,
                        [type]: { ...prev[type], canView: e.target.checked },
                      }))
                    }
                    className="h-4 w-4"
                  />
                  Ver
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={channels[type].canSend}
                    onChange={(e) =>
                      setChannels((prev) => ({
                        ...prev,
                        [type]: { ...prev[type], canSend: e.target.checked },
                      }))
                    }
                    className="h-4 w-4"
                  />
                  Enviar
                </label>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
