"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpLink } from "@/components/docs/help-link";

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  isActive: boolean;
};

type PendingReset = {
  memberId: string;
  name: string;
  email: string;
  requestedAt: string;
};

export function SmtpClient() {
  const [host, setHost] = useState("");
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [hasExisting, setHasExisting] = useState(false);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingReset[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});

  const refetchConfig = useCallback(async () => {
    const res = await fetch("/api/settings/smtp").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { config: SmtpConfig | null };
    if (data.config) {
      setHost(data.config.host);
      setPort(data.config.port);
      setSecure(data.config.secure);
      setUser(data.config.user);
      setFromName(data.config.fromName);
      setFromEmail(data.config.fromEmail);
      setIsActive(data.config.isActive);
      setHasExisting(true);
    }
  }, []);

  const refetchPending = useCallback(async () => {
    const res = await fetch("/api/settings/password-resets").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { pending: PendingReset[] };
    setPending(data.pending);
  }, []);

  useEffect(() => {
    void refetchConfig();
    void refetchPending();
  }, [refetchConfig, refetchPending]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    const res = await fetch("/api/settings/smtp", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        host,
        port,
        secure,
        user,
        password: password || undefined,
        fromName,
        fromEmail,
        isActive,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Não foi possível salvar");
      return;
    }
    setPassword("");
    setHasExisting(true);
    setSaveMessage("Configuração salva.");
  }

  async function test() {
    setTesting(true);
    setError(null);
    setTestMessage(null);
    const res = await fetch("/api/settings/smtp", { method: "POST" }).catch(() => null);
    setTesting(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Falha no teste");
      return;
    }
    const data = (await res.json()) as { sentTo: string };
    setTestMessage(`E-mail de teste enviado para ${data.sentTo}.`);
  }

  async function generateLink(memberId: string) {
    const res = await fetch(`/api/settings/password-resets/${memberId}`, {
      method: "POST",
    }).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { url: string };
    setLinks((prev) => ({ ...prev, [memberId]: data.url }));
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-end">
        <HelpLink slug="email" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Servidor SMTP</CardTitle>
          <CardDescription>
            Opcional — servidor de e-mail que você já possui, usado para
            recuperação de senha. Sem SMTP configurado, você continua vendo
            e resolvendo pedidos de redefinição manualmente aqui embaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-host">Host</Label>
              <Input id="smtp-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-port">Porta</Label>
              <Input
                id="smtp-port"
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="smtp-secure"
              type="checkbox"
              checked={secure}
              onChange={(e) => setSecure(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="smtp-secure">Conexão segura (TLS)</Label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-user">Usuário</Label>
              <Input id="smtp-user" value={user} onChange={(e) => setUser(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-password">
                Senha {hasExisting && "(deixe em branco para manter a atual)"}
              </Label>
              <Input
                id="smtp-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-from-name">Nome do remetente</Label>
              <Input id="smtp-from-name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Vocero CRM" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-from-email">E-mail do remetente</Label>
              <Input
                id="smtp-from-email"
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="noreply@seudominio.com.br"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="smtp-active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="smtp-active">Ativo</Label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saveMessage && <p className="text-sm text-[#3f6b52]">{saveMessage}</p>}
          {testMessage && <p className="text-sm text-[#3f6b52]">{testMessage}</p>}

          <div className="flex gap-2">
            <Button disabled={saving} onClick={() => void save()}>
              <Mail className="h-4 w-4" />
              {saving ? "Salvando…" : "Salvar"}
            </Button>
            <Button variant="outline" disabled={testing || !hasExisting} onClick={() => void test()}>
              <Send className="h-4 w-4" />
              {testing ? "Enviando…" : "Testar configuração"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Solicitações de redefinição de senha pendentes</CardTitle>
          <CardDescription>
            Sem SMTP (ou se o envio falhar), o pedido fica aqui até você
            gerar e enviar o link manualmente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>
          )}
          {pending.map((p) => (
            <div key={p.memberId} className="rounded-lg border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.email}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void generateLink(p.memberId)}>
                  Gerar link
                </Button>
              </div>
              {links[p.memberId] && (
                <Input readOnly className="mt-2" value={links[p.memberId]} />
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
