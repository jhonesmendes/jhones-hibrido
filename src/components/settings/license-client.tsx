"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type LicenseData = {
  type: string;
  status: string;
  active: boolean;
  expiresAt: string | null;
  trialEndsAt: string | null;
  limits: {
    maxOfficialNumbers: number;
    maxWebNumbers: number;
    maxDepartments: number;
    maxAdmins: number;
    maxAgents: number;
  };
  addonAgents: number;
  baseAgents: number;
};

type Usage = {
  maxOfficialNumbers: number;
  maxWebNumbers: number;
  maxDepartments: number;
  maxAdmins: number;
  maxAgents: number;
};

type Contact = { whatsapp: string | null; email: string | null };

const PLAN_LABEL: Record<string, string> = {
  trial: "Trial",
  starter: "Starter",
  business: "Business",
  enterprise: "Enterprise",
};

const RESOURCE_LABEL: Record<keyof Usage, string> = {
  maxOfficialNumbers: "Números oficiais",
  maxWebNumbers: "Números WhatsApp Web",
  maxDepartments: "Departamentos",
  maxAdmins: "Administradores",
  maxAgents: "Agentes",
};

function UsageBar({ label, current, limit }: { label: string; current: number; limit: number }) {
  const isUnlimited = limit >= 9999;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((current / Math.max(limit, 1)) * 100));
  const full = !isUnlimited && current >= limit;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className={full ? "font-medium text-destructive" : "text-muted-foreground"}>
          {current} / {isUnlimited ? "∞" : limit}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full ${full ? "bg-destructive" : "bg-brand"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function LicenseClient() {
  const [license, setLicense] = useState<LicenseData | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/license")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          d: {
            license: LicenseData | null;
            usage: Usage;
            contact: Contact | null;
          } | null
        ) => {
          if (cancelled || !d) return;
          setLicense(d.license);
          setUsage(d.usage);
          setContact(d.contact);
        }
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  if (!license || !usage) {
    return <p className="text-sm text-muted-foreground">Nenhuma licença encontrada.</p>;
  }

  const waLink = contact?.whatsapp
    ? `https://wa.me/${contact.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
        "Olá! Preciso falar sobre a minha licença do Vocero."
      )}`
    : null;

  return (
    <div className="max-w-lg space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sua licença</CardTitle>
            <Badge variant={license.active ? "success" : "destructive"}>
              {PLAN_LABEL[license.type] ?? license.type}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {license.type === "trial" && license.trialEndsAt && (
            <p
              className={`rounded-md p-2.5 text-sm ${
                daysUntil(license.trialEndsAt) <= 3
                  ? "bg-destructive/10 text-destructive"
                  : "bg-secondary/60 text-muted-foreground"
              }`}
            >
              {daysUntil(license.trialEndsAt) > 0
                ? `Seu trial expira em ${daysUntil(license.trialEndsAt)} dia(s).`
                : "Seu trial expirou."}
            </p>
          )}
          {!license.active && license.type !== "trial" && (
            <p className="rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">
              Licença {license.status === "suspended" ? "suspensa" : "expirada"} — fale
              com o suporte para regularizar.
            </p>
          )}

          <UsageBar label={RESOURCE_LABEL.maxAgents} current={usage.maxAgents} limit={license.limits.maxAgents} />
          {license.addonAgents > 0 && (
            <p className="text-xs text-muted-foreground">
              {license.baseAgents} incluso(s) · +{license.addonAgents} add-on contratado
            </p>
          )}
          <UsageBar
            label={RESOURCE_LABEL.maxAdmins}
            current={usage.maxAdmins}
            limit={license.limits.maxAdmins}
          />
          <UsageBar
            label={RESOURCE_LABEL.maxOfficialNumbers}
            current={usage.maxOfficialNumbers}
            limit={license.limits.maxOfficialNumbers}
          />
          <UsageBar
            label={RESOURCE_LABEL.maxWebNumbers}
            current={usage.maxWebNumbers}
            limit={license.limits.maxWebNumbers}
          />
          <UsageBar
            label={RESOURCE_LABEL.maxDepartments}
            current={usage.maxDepartments}
            limit={license.limits.maxDepartments}
          />

          {(waLink || contact?.email) && (
            <div className="border-t pt-4">
              <p className="mb-2 text-sm text-muted-foreground">Precisa de mais recursos?</p>
              <div className="flex gap-2">
                {waLink && (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md bg-[#25D366] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Falar via WhatsApp
                  </a>
                )}
                {contact?.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
                  >
                    Enviar e-mail
                  </a>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
