"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  ChevronUp,
  Copy,
  Info,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Department = { id: string; name: string };

type WhatsappNumber = {
  id: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: "connected" | "reconnect_required";
  isActive: boolean;
  tokenLast4: string;
};

type WebhookInfo = {
  url: string;
  verifyToken: string;
  isHttps: boolean;
  signatureLayer: boolean;
};

/**
 * v0.1: N números oficiais por organização, não mais 1 — cada linha em
 * `meta_credentials` é um canal próprio. O webhook continua sendo UM só
 * por organização (roteia por phone_number_id do payload, já resolvido
 * no servidor); por isso o card do webhook fica fora da lista de números.
 */
export function WhatsappWizard() {
  const [numbers, setNumbers] = useState<WhatsappNumber[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [webhook, setWebhook] = useState<WebhookInfo | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const refetch = useCallback(async () => {
    const [numbersRes, w, d] = await Promise.all([
      fetch("/api/settings/whatsapp/numbers"),
      fetch("/api/settings/webhook").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/settings/departments").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null, null]);
    if (numbersRes?.status === 403) setForbidden(true);
    const n = numbersRes?.ok ? await numbersRes.json() : null;
    if (n) setNumbers(n.numbers);
    if (w) setWebhook(w);
    if (d) setDepartments(d.departments);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  if (forbidden) {
    return (
      <p className="text-sm text-muted-foreground">
        Canais são configuração da organização — só owner e administradores
        podem ver e gerenciar os números conectados.
      </p>
    );
  }

  const hasReconnectRequired = numbers?.some((n) => n.status === "reconnect_required");

  return (
    <div className="max-w-3xl space-y-6">
      {hasReconnectRequired && (
        <div className="flex items-start gap-2 rounded-lg border border-[#ecd4d2] bg-[#faf1f0] p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-[#a2504c]">
              Um ou mais números têm o token vencido ou revogado.
            </p>
            <p className="text-[#a2504c]/80">
              Os envios por esse número estão pausados. Abra-o abaixo e cole
              um token novo para reconectar.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {numbers?.map((n) => (
          <NumberCard
            key={n.id}
            number={n}
            departments={departments}
            onChanged={() => void refetch()}
          />
        ))}

        {numbers?.length === 0 && !addingNew && (
          <p className="text-sm text-muted-foreground">
            Nenhum número oficial conectado ainda.
          </p>
        )}

        {addingNew ? (
          <ConnectForm
            onSaved={() => {
              setAddingNew(false);
              void refetch();
            }}
            onCancel={() => setAddingNew(false)}
          />
        ) : (
          <Button variant="outline" onClick={() => setAddingNew(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Adicionar número
          </Button>
        )}
      </div>

      {webhook && <WebhookCard webhook={webhook} />}
    </div>
  );
}

function NumberCard({
  number: n,
  departments,
  onChanged,
}: {
  number: WhatsappNumber;
  departments: Department[];
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(n.status === "reconnect_required");
  const [busy, setBusy] = useState(false);

  async function toggleActive() {
    setBusy(true);
    await fetch(`/api/settings/whatsapp/numbers/${n.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !n.isActive }),
    }).catch(() => null);
    setBusy(false);
    onChanged();
  }

  async function setDepartment(departmentId: string) {
    setBusy(true);
    await fetch(`/api/settings/whatsapp/numbers/${n.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ departmentId: departmentId || null }),
    }).catch(() => null);
    setBusy(false);
    onChanged();
  }

  async function remove() {
    if (!confirm(`Remover o número "${n.name}"? Isso não pode ser desfeito.`)) return;
    setBusy(true);
    await fetch(`/api/settings/whatsapp/numbers/${n.id}`, { method: "DELETE" }).catch(
      () => null
    );
    setBusy(false);
    onChanged();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <BadgeCheck className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base">{n.name}</CardTitle>
            <CardDescription>
              {n.displayPhoneNumber ?? n.phoneNumberId}
              {n.verifiedName ? ` · ${n.verifiedName}` : ""}
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={n.status === "connected" ? "success" : "destructive"}>
            {n.status === "connected" ? "Conectado" : "Reconectar"}
          </Badge>
          {!n.isActive && <Badge variant="outline">Inativo</Badge>}
          <Button
            variant="ghost"
            size="icon"
            aria-label={expanded ? "Recolher" : "Editar"}
            disabled={busy}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4 border-t pt-4">
          {n.description && <p className="text-sm text-muted-foreground">{n.description}</p>}
          {departments.length > 0 && (
            <div className="space-y-1.5">
              <Label>Departamento</Label>
              <select
                value={n.departmentId ?? ""}
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
          <ConnectForm existing={n} onSaved={onChanged} />
          <div className="flex items-center justify-between border-t pt-3">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void toggleActive()}>
              {n.isActive ? "Desativar" : "Reativar"}
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

function ConnectForm({
  existing,
  onSaved,
  onCancel,
}: {
  existing?: WhatsappNumber;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [wabaId, setWabaId] = useState(existing?.wabaId ?? "");
  const [phoneNumberId, setPhoneNumberId] = useState(existing?.phoneNumberId ?? "");
  const [token, setToken] = useState("");
  const [testResult, setTestResult] = useState<
    { ok: true; display: string } | { ok: false; message: string } | null
  >(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canTest = wabaId.trim() && phoneNumberId.trim() && token.trim();

  async function test() {
    setTesting(true);
    setTestResult(null);
    const res = await fetch("/api/settings/whatsapp/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumberId, token }),
    }).catch(() => null);
    setTesting(false);
    if (!res) {
      setTestResult({ ok: false, message: "Sem conexão com o servidor" });
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      displayPhoneNumber?: string;
      error?: { message?: string };
    } | null;
    if (res.ok && data?.displayPhoneNumber) {
      setTestResult({ ok: true, display: data.displayPhoneNumber });
    } else {
      setTestResult({ ok: false, message: data?.error?.message ?? "A validação falhou" });
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    const res = existing
      ? await fetch(`/api/settings/whatsapp/numbers/${existing.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        }).catch(() => null)
      : await fetch("/api/settings/whatsapp/numbers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name.trim() || undefined, wabaId, phoneNumberId, token }),
        }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setSaveError(data?.error?.message ?? "Não foi possível salvar a conexão");
      return;
    }
    setToken("");
    setTestResult(null);
    onSaved();
  }

  return (
    <Card className={existing ? "border-0 shadow-none" : undefined}>
      <CardHeader className={existing ? "px-0 pt-0" : undefined}>
        <CardTitle>
          {existing ? "Reconectar com um token novo" : "Conectar um número de WhatsApp"}
        </CardTitle>
        <CardDescription>
          Cole as credenciais da WhatsApp Cloud API. O token é validado na
          Meta ANTES de ser salvo e é armazenado criptografado.
        </CardDescription>
      </CardHeader>
      <CardContent className={`space-y-4 ${existing ? "px-0" : ""}`}>
        {!existing && (
          <div className="grid gap-3 rounded-md border bg-background/40 p-4 text-sm">
            <p className="font-medium">De onde vem o token?</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="mb-1 font-medium text-primary">Modo direto</p>
                <p className="text-muted-foreground">
                  O negócio tem o próprio app em{" "}
                  <span className="text-foreground">developers.facebook.com</span>:
                  use um token de <span className="text-foreground">usuário do sistema</span>{" "}
                  (não expira) com permissões de WhatsApp. Neste modo, vale
                  configurar também o App Secret para a assinatura do webhook.
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="mb-1 font-medium text-primary">Modo agência (Tech Provider)</p>
                <p className="text-muted-foreground">
                  Sua agência faz o Embedded Signup na plataforma DELA e o
                  backend dela obtém o token do cliente; ela entrega o token
                  para colar aqui. O webhook conecta com o{" "}
                  <span className="text-foreground">override por WABA</span>{" "}
                  (checklist de 5 passos no README).
                </p>
              </div>
            </div>
          </div>
        )}

        {!existing && (
          <div className="space-y-1.5">
            <Label htmlFor="channel-name">Nome do canal (opcional)</Label>
            <Input
              id="channel-name"
              placeholder="Ex.: Comercial, Suporte, CCD…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="waba-id">WABA ID</Label>
            <Input
              id="waba-id"
              placeholder="ID da conta do WhatsApp Business"
              value={wabaId}
              disabled={Boolean(existing)}
              onChange={(e) => setWabaId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone-number-id">Phone Number ID</Label>
            <Input
              id="phone-number-id"
              placeholder="ID do número de telefone"
              value={phoneNumberId}
              disabled={Boolean(existing)}
              onChange={(e) => setPhoneNumberId(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="token">Token de acesso</Label>
          <Input
            id="token"
            type="password"
            placeholder={
              existing ? `Salvo (…${existing.tokenLast4}) — cole um novo para trocar` : "EAAG…"
            }
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setTestResult(null);
            }}
          />
        </div>

        {testResult && (
          <p className={`text-sm ${testResult.ok ? "text-success" : "text-destructive"}`}>
            {testResult.ok
              ? `✓ Token válido para ${testResult.display}. Já pode salvar.`
              : testResult.message}
          </p>
        )}
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}

        <div className="flex gap-2">
          <Button variant="outline" disabled={!canTest || testing} onClick={() => void test()}>
            {testing ? "Testando…" : "Testar conexão"}
          </Button>
          <Button disabled={!testResult?.ok || saving} onClick={() => void save()}>
            {saving ? "Salvando…" : existing ? "Salvar token novo" : "Salvar número"}
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={saving}>
              Cancelar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function WebhookCard({ webhook }: { webhook: WebhookInfo }) {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, which: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhook do WhatsApp</CardTitle>
        <CardDescription>
          Uma única URL para toda a organização — o roteamento entre os seus
          números usa o Phone Number ID de cada evento, não a URL. Cole estes
          valores no painel da Meta (modo direto) ou use-os no override do
          backend da sua agência (no nível da WABA).{" "}
          <strong className="text-foreground">
            Salve ao menos um número ANTES de configurar o webhook:
          </strong>{" "}
          a verificação (handshake) funciona sem salvar, mas as mensagens só
          são recebidas com a conexão salva.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!webhook.isHttps && (
          <p className="flex items-start gap-2 rounded-md border border-[#ece2cf] bg-[#faf7f0] p-3 text-xs text-[#8a6d3b]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            A URL configurada não é https: a Meta exige https para webhooks.
            Ajuste APP_BASE_URL com o seu domínio público.
          </p>
        )}
        <div className="space-y-1.5">
          <Label>URL do webhook (callback URL)</Label>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-background/60 px-3 py-2 text-xs">
              {webhook.url}
            </code>
            <Button
              variant="outline"
              size="icon"
              aria-label="Copiar URL"
              onClick={() => copy(webhook.url, "url")}
            >
              <Copy className="h-4 w-4" />
            </Button>
            {copied === "url" && <span className="text-xs text-primary">Copiada ✓</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            A URL contém o token secreto no caminho: trate-a como uma senha.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Verify token</Label>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-background/60 px-3 py-2 text-xs">
              {webhook.verifyToken}
            </code>
            <Button
              variant="outline"
              size="icon"
              aria-label="Copiar verify token"
              onClick={() => copy(webhook.verifyToken, "vt")}
            >
              <Copy className="h-4 w-4" />
            </Button>
            {copied === "vt" && <span className="text-xs text-primary">Copiado ✓</span>}
          </div>
        </div>
        {webhook.signatureLayer ? (
          <p className="flex items-center gap-2 text-xs text-success">
            <ShieldCheck className="h-4 w-4" /> Verificação de assinatura ativa
            (META_APP_SECRET configurado): cada evento é validado com
            x-hub-signature-256.
          </p>
        ) : (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" /> Sem App Secret
            configurado: o webhook fica protegido pela URL secreta (normal no
            modo agência). Para a camada extra de assinatura, adicione
            META_APP_SECRET à instância.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
