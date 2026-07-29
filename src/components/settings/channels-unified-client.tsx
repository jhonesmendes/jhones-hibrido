"use client";

import { useState } from "react";
import { BadgeCheck, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { WhatsappWizard } from "@/components/settings/whatsapp-wizard";
import { ChannelsClient } from "@/components/settings/channels-client";
import { HelpLink } from "@/components/docs/help-link";

type Tab = "official" | "unofficial";

/**
 * Tela única de Canais: agrupa o canal oficial (Meta Cloud API) e o não
 * oficial (motor Baileys) em abas, no lugar de duas rotas separadas
 * (`/settings/whatsapp` e `/settings/channels`). Cada canal segue com no
 * máximo um número por organização (ver schema.meta_credentials /
 * unofficial_channel) — não é uma lista multi-número.
 */
export function ChannelsUnifiedClient() {
  const [tab, setTab] = useState<Tab>("official");

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between border-b">
        <div className="flex gap-1">
        <TabButton
          active={tab === "official"}
          onClick={() => setTab("official")}
          icon={<BadgeCheck className="h-3.5 w-3.5" />}
          label="Oficial (Meta API)"
        />
        <TabButton
          active={tab === "unofficial"}
          onClick={() => setTab("unofficial")}
          icon={<Wifi className="h-3.5 w-3.5" />}
          label="WhatsApp Web"
        />
        </div>
        <HelpLink slug="canais" />
      </div>

      {tab === "official" ? <WhatsappWizard /> : <ChannelsClient />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-brand text-brand-text"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
