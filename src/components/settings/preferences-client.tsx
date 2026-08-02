"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const OPTIONS = [
  {
    id: true as const,
    label: "Misturadas na Caixa de Entrada",
    hint: "Grupos aparecem junto com as conversas individuais na aba \"Todas\"",
  },
  {
    id: false as const,
    label: "Só na aba \"Grupos\"",
    hint: "Grupos ficam de fora da aba \"Todas\" e do contador de não lidas do menu",
  },
];

/**
 * Preferência pessoal (por membro, não por organização) — cada pessoa da
 * equipe escolhe a sua. Persistida no servidor (não em localStorage) para
 * valer em qualquer dispositivo que essa pessoa use para logar.
 */
export function PreferencesClient() {
  const [groupsInInbox, setGroupsInInbox] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/inbox-preferences")
      .then((r) => (r.ok ? r.json() : { groupsInInbox: true }))
      .then((d: { groupsInInbox?: boolean }) => setGroupsInInbox(d.groupsInInbox ?? true))
      .catch(() => setGroupsInInbox(true));
  }, []);

  async function select(value: boolean) {
    setGroupsInInbox(value);
    setSaving(true);
    await fetch("/api/settings/inbox-preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupsInInbox: value }),
    }).catch(() => null);
    setSaving(false);
  }

  return (
    <div className="max-w-2xl space-y-6 p-4 md:p-6">
      <div>
        <h2 className="font-semibold">Preferências</h2>
        <p className="text-sm text-muted-foreground">
          Ajustes pessoais de exibição — só valem para a sua conta
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" /> Mensagens de grupos
          </CardTitle>
          <CardDescription>
            Como as conversas de grupos do WhatsApp aparecem para você na Caixa de
            Entrada
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="radiogroup"
            aria-label="Exibição de grupos na Caixa de Entrada"
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {OPTIONS.map((o) => (
              <button
                key={String(o.id)}
                type="button"
                role="radio"
                aria-checked={groupsInInbox === o.id}
                disabled={groupsInInbox === null || saving}
                onClick={() => void select(o.id)}
                className={cn(
                  "rounded-md border p-3 text-left transition-colors disabled:opacity-60",
                  groupsInInbox === o.id
                    ? "border-brand bg-brand-tint"
                    : "hover:border-border-strong hover:bg-accent"
                )}
              >
                <span
                  className={cn(
                    "block text-sm font-medium",
                    groupsInInbox === o.id && "text-brand-text"
                  )}
                >
                  {o.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {o.hint}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
