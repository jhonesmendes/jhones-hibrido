"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  QrCode,
  Trash2,
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

type Provider = "evolution" | "wppconnect" | "waha";

type Channel = {
  provider: Provider;
  baseUrl: string;
  instanceName: string;
  apiKeyLast4: string;
  status: "disconnected" | "connecting" | "connected";
  displayPhoneNumber: string | null;
  webhookUrl: string;
};

type LiveStatus = {
  state: "disconnected" | "connecting" | "connected";
  qrCode: string | null;
  phoneNumber: string | null;
};

const PROVIDERS: { id: Provider; label: string; hint: string }[] = [
  {
    id: "evolution",
    label: "Evolution API",
    hint: "API key global ou da instância (header apikey)",
  },
  {
    id: "wppconnect",
    label: "WPPConnect",
    hint: "Token Bearer gerado com o SECRET_KEY do server",
  },
  { id: "waha", label: "WAHA", hint: "X-Api-Key do servidor WAHA" },
];

export function ChannelsClient() {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/channels").catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { channel: Channel | null };
      setChannel(data.channel);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start gap-2 rounded-lg border border-[#ece2cf] bg-[#faf7f0] p-4 text-sm text-[#8a6d3b]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Canal <strong>não oficial</strong> (gateway tipo Baileys). A Meta
          pode banir o número: use um secundário, não o principal do negócio.
          No modelo híbrido, a captação entra pela Cloud API oficial e a
          automação opera por este número.
        </p>
      </div>

      {channel && <StatusCard channel={channel} onChanged={refetch} />}

      <ConfigForm existing={channel} onSaved={refetch} />
    </div>
  );
}

function StatusCard({
  channel,
  onChanged,
}: {
  channel: Channel;
  onChanged: () => Promise<void> | void;
}) {
  const [live, setLive] = useState<LiveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    const res = await fetch("/api/settings/channels/status").catch(() => null);
    if (!res) return;
    if (res.ok) {
      setError(null);
      setLive((await res.json()) as LiveStatus);
    } else {
      const data = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Erro ao consultar o gateway");
    }
  }, []);

  useEffect(() => {
    void poll();
    timer.current = setInterval(() => void poll(), 5000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [poll]);

  async function remove() {
    if (!confirm("Excluir a configuração do canal não oficial?")) return;
    await fetch("/api/settings/channels", { method: "DELETE" });
    await onChanged();
  }

  function copyWebhook() {
    void navigator.clipboard.writeText(channel.webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const state = live?.state ?? channel.status;
  const providerLabel =
    PROVIDERS.find((p) => p.id === channel.provider)?.label ?? channel.provider;
  const qr = live?.qrCode;
  const qrIsText = qr?.startsWith("qr-text:");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>
              {providerLabel} · {channel.instanceName}
            </CardTitle>
            <CardDescription>
              {channel.baseUrl} · API key …{channel.apiKeyLast4}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {state === "connected" ? (
              <Badge variant="success">Conectado</Badge>
            ) : state === "connecting" ? (
              <Badge>Aguardando QR…</Badge>
            ) : (
              <Badge variant="destructive">Desconectado</Badge>
            )}
            <Button size="sm" variant="ghost" onClick={() => void remove()}>
              <Trash2 className="h-4 w-4" strokeWidth={1.7} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === "connected" && (
          <div className="flex items-center gap-3 rounded-lg border border-[#d8e8dd] bg-[#eff7f1] p-4 text-sm">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <p className="font-medium text-[#3f6b52]">
              Número conectado
              {(live?.phoneNumber ?? channel.displayPhoneNumber)
                ? `: +${live?.phoneNumber ?? channel.displayPhoneNumber}`
                : ""}
            </p>
          </div>
        )}

        {state !== "connected" && (
          <div className="flex items-start gap-4">
            <div className="flex h-44 w-44 shrink-0 items-center justify-center rounded-lg border bg-secondary">
              {qr && !qrIsText ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR code" className="h-40 w-40" />
              ) : (
                <QrCode className="h-10 w-10 text-text-3" strokeWidth={1.2} />
              )}
            </div>
            <div className="space-y-2 text-sm text-text-2">
              <p className="font-medium text-foreground">
                Escaneie o QR com o celular do número secundário
              </p>
              <p>
                WhatsApp → Aparelhos conectados → Conectar um aparelho. O
                status atualiza sozinho (consulta a cada 5 s).
              </p>
              {qrIsText && qr && (
                <p className="break-all rounded-md border bg-secondary p-2 font-mono text-[11px]">
                  {qr.slice("qr-text:".length)}
                </p>
              )}
              {error && <p className="text-destructive">{error}</p>}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Webhook do gateway (eventos de entrada)</Label>
          <div className="flex items-center gap-2">
            <Input readOnly value={channel.webhookUrl} className="font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={copyWebhook}>
              <Copy className="h-4 w-4" strokeWidth={1.7} />
              {copied ? "Copiado!" : "Copiar"}
            </Button>
          </div>
          <p className="text-xs text-text-3">
            Evolution e WAHA são configurados sozinhos ao salvar. No
            WPPConnect, coloque como <code>webhook.url</code> no config.json
            do server.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigForm({
  existing,
  onSaved,
}: {
  existing: Channel | null;
  onSaved: () => Promise<void> | void;
}) {
  const [provider, setProvider] = useState<Provider>(
    existing?.provider ?? "evolution"
  );
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? "");
  const [instanceName, setInstanceName] = useState(
    existing?.instanceName ?? ""
  );
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave =
    baseUrl.trim() && instanceName.trim() && apiKey.trim() && !saving;

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/settings/channels", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, baseUrl, instanceName, apiKey }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) {
      setApiKey("");
      await onSaved();
      return;
    }
    const data = (await res?.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    setError(
      data?.error?.message ??
        "Não foi possível validar o gateway: confira URL, instância e API key"
    );
  }

  const hint = PROVIDERS.find((p) => p.id === provider)?.hint;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {existing ? "Reconfigurar canal" : "Conectar gateway não oficial"}
        </CardTitle>
        <CardDescription>
          Aponte para o seu gateway self-hosted. A API key é criptografada em
          repouso e nunca é exibida completa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Provedor</Label>
          <div className="flex gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                className={
                  provider === p.id
                    ? "rounded-md border border-brand bg-brand-tint px-3 py-2 text-sm font-medium text-brand-text"
                    : "rounded-md border px-3 py-2 text-sm text-text-2 hover:bg-accent"
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ch-url">URL base do gateway</Label>
          <Input
            id="ch-url"
            placeholder="https://evolution.meudominio.com.br"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ch-instance">Instância / sessão</Label>
          <Input
            id="ch-instance"
            placeholder="principal"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ch-key">API key</Label>
          <Input
            id="ch-key"
            type="password"
            placeholder={
              existing ? `Atual: …${existing.apiKeyLast4} (cole uma nova)` : ""
            }
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          {hint && <p className="text-xs text-text-3">{hint}</p>}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button disabled={!canSave} onClick={() => void save()}>
          {saving ? "Validando…" : "Salvar e conectar"}
        </Button>
      </CardContent>
    </Card>
  );
}
