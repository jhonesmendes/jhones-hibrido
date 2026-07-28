"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, LogOut, QrCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEvents } from "@/components/use-events";

type ChannelStatus = {
  status: "disconnected" | "connecting" | "connected";
  qrCode: string | null;
  phoneNumber: string | null;
};

/**
 * Tela de conexão do canal não oficial — motor nativo (Baileys), sem
 * gateway de terceiros. Nada de URL/instância/API key: só conectar e
 * escanear. Estado em tempo real via SSE, sem polling.
 */
export function ChannelsClient() {
  const [state, setState] = useState<ChannelStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    fetch("/api/settings/channels")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ChannelStatus | null) => setState(d))
      .catch(() => {});
  }, []);

  useEvents({
    onChannelStatus: (data) => setState(data),
  });

  async function connect() {
    setConnecting(true);
    await fetch("/api/settings/channels", { method: "POST" }).catch(
      () => null
    );
    setConnecting(false);
  }

  async function disconnect() {
    if (
      !confirm(
        "Desconectar o número não oficial? Será preciso escanear um QR novo para reconectar."
      )
    ) {
      return;
    }
    setDisconnecting(true);
    await fetch("/api/settings/channels", { method: "DELETE" }).catch(
      () => null
    );
    setDisconnecting(false);
  }

  if (!state) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start gap-2 rounded-lg border border-[#ece2cf] bg-[#faf7f0] p-4 text-sm text-[#8a6d3b]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Canal <strong>não oficial</strong> — motor próprio do Vocero,
          conexão direta ao WhatsApp (sem gateway de terceiros). A Meta pode
          banir o número: use um secundário, não o principal do negócio. No
          modelo híbrido, a captação entra pela Cloud API oficial e a
          automação opera por este número.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>Canal não oficial</CardTitle>
              <CardDescription>
                Sem URL, instância ou API key para configurar — só conectar.
              </CardDescription>
            </div>
            {state.status === "connected" ? (
              <Badge variant="success">Conectado</Badge>
            ) : state.status === "connecting" ? (
              <Badge>Conectando…</Badge>
            ) : (
              <Badge variant="destructive">Desconectado</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.status === "connected" ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#d8e8dd] bg-[#eff7f1] p-4">
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <p className="font-medium text-[#3f6b52]">
                  Número conectado
                  {state.phoneNumber ? `: +${state.phoneNumber}` : ""}
                </p>
              </div>
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
                {state.qrCode ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={state.qrCode}
                    alt="QR code"
                    className="h-40 w-40"
                  />
                ) : (
                  <QrCode
                    className="h-10 w-10 text-text-3"
                    strokeWidth={1.2}
                  />
                )}
              </div>
              <div className="space-y-3 text-sm text-text-2">
                <p className="font-medium text-foreground">
                  {state.status === "connecting" && state.qrCode
                    ? "Escaneie o QR com o celular do número secundário"
                    : "Clique em conectar para gerar o QR"}
                </p>
                <p>
                  WhatsApp → Aparelhos conectados → Conectar um aparelho. O
                  status atualiza sozinho, em tempo real.
                </p>
                {state.status !== "connecting" && (
                  <Button disabled={connecting} onClick={() => void connect()}>
                    {connecting ? "Iniciando…" : "Conectar"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
