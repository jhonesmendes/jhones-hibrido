"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, Send } from "lucide-react";
import type { CampaignDto, CampaignRecipientDto } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEvents } from "@/components/use-events";

const STATUS_BADGE: Record<
  CampaignDto["status"],
  { label: string; variant: "secondary" | "warning" | "success" | "destructive" }
> = {
  draft: { label: "Rascunho", variant: "secondary" },
  sending: { label: "Enviando", variant: "warning" },
  sent: { label: "Enviada", variant: "success" },
  cancelled: { label: "Cancelada", variant: "destructive" },
};

const RECIPIENT_BADGE: Record<
  CampaignRecipientDto["status"],
  { label: string; variant: "secondary" | "success" | "destructive" }
> = {
  pending: { label: "Pendente", variant: "secondary" },
  sent: { label: "Enviado", variant: "success" },
  failed: { label: "Falhou", variant: "destructive" },
};

export function CampaignDetailClient({ id }: { id: string }) {
  const [campaign, setCampaign] = useState<CampaignDto | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipientDto[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}`).catch(() => null);
    if (!res) return;
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as {
      campaign: CampaignDto;
      recipients: CampaignRecipientDto[];
    };
    setCampaign(data.campaign);
    setRecipients(data.recipients);
  }, [id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEvents({
    onCampaignRun: (data) => {
      if (data.campaignId !== id) return;
      void refetch();
    },
  });

  async function send() {
    setActing(true);
    setActionError(null);
    const res = await fetch(`/api/campaigns/${id}/send`, {
      method: "POST",
    }).catch(() => null);
    setActing(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setActionError(data?.error?.message ?? "Não foi possível disparar");
      return;
    }
    void refetch();
  }

  async function cancel() {
    setActing(true);
    setActionError(null);
    const res = await fetch(`/api/campaigns/${id}/cancel`, {
      method: "POST",
    }).catch(() => null);
    setActing(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setActionError(data?.error?.message ?? "Não foi possível cancelar");
      return;
    }
    void refetch();
  }

  if (notFound) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-3">
        Campanha não encontrada.
      </div>
    );
  }
  if (!campaign) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-3">
        Carregando…
      </div>
    );
  }

  const pending = campaign.total - campaign.sent - campaign.failed;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/campanhas"
            className="rounded-sm p-1.5 text-text-3 hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">{campaign.name}</h2>
              <Badge variant="secondary">
                {campaign.channel === "official" ? "Oficial" : "WhatsApp Web"}
              </Badge>
              <Badge variant={STATUS_BADGE[campaign.status].variant}>
                {STATUS_BADGE[campaign.status].label}
              </Badge>
              {campaign.scheduledAt && campaign.status === "draft" && (
                <Badge variant="secondary">
                  Agendada para{" "}
                  {new Date(campaign.scheduledAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === "draft" && (
            <Button disabled={acting} onClick={() => void send()}>
              <Send className="h-4 w-4" strokeWidth={1.7} />
              {acting ? "Disparando…" : "Disparar"}
            </Button>
          )}
          {campaign.status === "sending" && (
            <Button
              variant="outline"
              disabled={acting}
              onClick={() => void cancel()}
            >
              <Ban className="h-4 w-4" strokeWidth={1.7} />
              {acting ? "Cancelando…" : "Cancelar"}
            </Button>
          )}
        </div>
      </header>

      {actionError && (
        <p className="border-b bg-[#faf1f0] px-6 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      <div className="flex gap-4 border-b px-6 py-4">
        <Stat label="Total" value={campaign.total} />
        <Stat label="Enviados" value={campaign.sent} />
        <Stat label="Falharam" value={campaign.failed} />
        <Stat label="Pendentes" value={Math.max(pending, 0)} />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-text-3">
              <th className="pb-2 font-medium">Telefone</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((r) => (
              <tr key={r.id} className="border-b border-border/70">
                <td className="py-2 font-mono text-xs">+{r.phone}</td>
                <td className="py-2">
                  <Badge variant={RECIPIENT_BADGE[r.status].variant}>
                    {RECIPIENT_BADGE[r.status].label}
                  </Badge>
                </td>
                <td className="py-2 text-xs text-text-3">
                  {r.error ??
                    Object.entries(r.variables)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-text-3">{label}</p>
    </div>
  );
}
