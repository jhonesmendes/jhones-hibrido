"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Megaphone, Plus, Workflow } from "lucide-react";
import type { CampaignDto } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { N8nAutomationsClient } from "@/components/campaigns/n8n-automations-client";
import { HelpLink } from "@/components/docs/help-link";
import { NewCampaignWizard } from "@/components/campaigns/new-campaign-wizard";

const STATUS_BADGE: Record<
  CampaignDto["status"],
  { label: string; variant: "secondary" | "warning" | "success" | "destructive" }
> = {
  draft: { label: "Rascunho", variant: "secondary" },
  sending: { label: "Enviando", variant: "warning" },
  sent: { label: "Enviada", variant: "success" },
  cancelled: { label: "Cancelada", variant: "destructive" },
};

export function CampaignsClient() {
  const router = useRouter();
  const [tab, setTab] = useState<"campanhas" | "n8n">("campanhas");
  const [campaigns, setCampaigns] = useState<CampaignDto[] | null>(null);
  const [creating, setCreating] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/campaigns").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { campaigns: CampaignDto[] };
    setCampaigns(data.campaigns);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <h2 className="font-semibold">Campanhas</h2>
        <div className="flex items-center gap-2">
          <HelpLink slug={tab === "n8n" ? "automacoes-n8n" : "campanhas"} />
          {tab === "campanhas" && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" strokeWidth={1.7} />
              Nova campanha
            </Button>
          )}
        </div>
      </header>

      <div className="flex border-b px-6">
        <button
          type="button"
          onClick={() => setTab("campanhas")}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab === "campanhas"
              ? "border-brand text-brand-text"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Campanhas
        </button>
        <button
          type="button"
          onClick={() => setTab("n8n")}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab === "n8n"
              ? "border-brand text-brand-text"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Workflow className="h-3.5 w-3.5" /> Automações N8N
        </button>
      </div>

      {tab === "n8n" ? (
        <N8nAutomationsClient />
      ) : (
      <div className="flex-1 overflow-y-auto p-6">
        {campaigns === null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : campaigns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Megaphone className="h-8 w-8 text-text-3" strokeWidth={1.3} />
            <p className="text-sm font-medium">Nenhuma campanha ainda</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Crie uma campanha para enviar uma mensagem a vários contatos de
              uma vez, importando uma lista por CSV.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/campanhas/${c.id}`}
                  className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {c.name}
                      </span>
                      <Badge variant="secondary">
                        {c.channel === "official" ? "Oficial" : "WhatsApp Web"}
                      </Badge>
                      <Badge variant={STATUS_BADGE[c.status].variant}>
                        {STATUS_BADGE[c.status].label}
                      </Badge>
                      {c.scheduledAt && c.status === "draft" && (
                        <Badge variant="secondary">
                          Agendada para{" "}
                          {new Date(c.scheduledAt).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.total} destinatário(s) · {c.sent} enviado(s) ·{" "}
                      {c.failed} falhou(aram)
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}

      {creating && (
        <NewCampaignWizard
          onClose={() => setCreating(false)}
          onCreated={(campaignId) => {
            setCreating(false);
            router.push(`/campanhas/${campaignId}`);
          }}
        />
      )}
    </div>
  );
}
