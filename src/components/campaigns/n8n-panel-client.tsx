"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Workflow } from "lucide-react";

type N8nConfigView = { baseUrl: string; apiKeyLast4: string };

export function N8nPanelClient() {
  const [loaded, setLoaded] = useState(false);
  const [config, setConfig] = useState<N8nConfigView | null>(null);

  useEffect(() => {
    fetch("/api/settings/n8n")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { config: N8nConfigView | null } | null) => {
        setConfig(data?.config ?? null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  }

  if (!config) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Workflow className="h-8 w-8 text-text-3" strokeWidth={1.3} />
        <p className="text-sm font-medium">N8N ainda não configurado</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Configure a instância N8N na aba{" "}
          <Link href="/campanhas" className="text-primary hover:underline">
            Campanhas → Automações N8N
          </Link>{" "}
          para ver o painel aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div>
          <h1 className="text-sm font-semibold">Painel N8N</h1>
          <p className="text-xs text-muted-foreground">{config.baseUrl}</p>
        </div>
        <a
          href={config.baseUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> Abrir em nova aba
        </a>
      </div>
      <iframe src={config.baseUrl} title="Painel N8N" className="block w-full flex-1" />
      <p className="border-t bg-secondary/20 p-2 text-center text-[11px] text-muted-foreground">
        Se o painel não aparecer acima, o N8N pode estar bloqueando incorporação
        (X-Frame-Options) — use &quot;Abrir em nova aba&quot;.
      </p>
    </div>
  );
}
