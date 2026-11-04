"use client";

import { useCallback, useEffect, useState } from "react";
import { HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFileSize } from "@/lib/media";

type Usage = {
  onDiskCount: number;
  onDiskBytes: number;
  inDatabaseCount: number;
  inDatabaseBytes: number;
  purgedCount: number;
  oldestStoredAt: string | null;
};

const RETENTION_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Guardar para sempre" },
  { value: 30, label: "30 dias" },
  { value: 60, label: "60 dias" },
  { value: 90, label: "90 dias" },
  { value: 180, label: "6 meses" },
  { value: 365, label: "1 ano" },
  { value: 730, label: "2 anos" },
];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Uso de armazenamento de mídia e política de retenção (por organização).
 * Mídia fica em arquivos no volume da instância (`MEDIA_DIR`); a retenção
 * apaga os bytes antigos — texto e registro das mensagens continuam.
 */
export function StorageClient({ canEdit }: { canEdit: boolean }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [saved, setSaved] = useState<number | null | undefined>(undefined);
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/storage").catch(() => null);
    if (!res?.ok) {
      setError("Não foi possível carregar o armazenamento");
      return;
    }
    const data = (await res.json()) as { config: { retentionDays: number | null }; usage: Usage };
    setUsage(data.usage);
    setSaved(data.config.retentionDays);
    setSelected(data.config.retentionDays);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function save() {
    setError(null);
    setNotice(null);
    const tightening = selected !== null && (saved === null || saved === undefined || selected < saved);
    if (
      tightening &&
      !confirm(
        `Mídias (fotos, áudios, vídeos e documentos) com mais de ${selected} dias serão apagadas de forma DEFINITIVA. O texto das mensagens continua. Confirmar?`
      )
    ) {
      return;
    }
    setSaving(true);
    const res = await fetch("/api/settings/storage", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ retentionDays: selected }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(data?.error?.message ?? "Não foi possível salvar");
      return;
    }
    setNotice("Política de retenção salva.");
    // A limpeza roda em segundo plano — recarrega os números logo depois.
    setTimeout(() => void refetch(), 1500);
  }

  const options = RETENTION_OPTIONS.some((o) => o.value === saved)
    ? RETENTION_OPTIONS
    : [...RETENTION_OPTIONS, { value: saved ?? null, label: `${saved} dias` }];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-semibold">Armazenamento</h2>
        <p className="text-sm text-muted-foreground">
          Fotos, áudios, vídeos e documentos das conversas ficam guardados no servidor desta
          instância
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <HardDrive className="h-4 w-4 text-muted-foreground" /> Uso atual
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!usage ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Stat
                label="Mídias guardadas"
                value={(usage.onDiskCount + usage.inDatabaseCount).toLocaleString("pt-BR")}
                hint={formatFileSize(usage.onDiskBytes + usage.inDatabaseBytes)}
              />
              <Stat
                label="Mais antiga guardada"
                value={
                  usage.oldestStoredAt
                    ? new Date(usage.oldestStoredAt).toLocaleDateString("pt-BR")
                    : "—"
                }
              />
              <Stat
                label="Apagadas pela retenção"
                value={usage.purgedCount.toLocaleString("pt-BR")}
              />
            </div>
          )}
          {usage && usage.inDatabaseCount > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {usage.inDatabaseCount.toLocaleString("pt-BR")} mídia(s) (
              {formatFileSize(usage.inDatabaseBytes)}) ainda no banco de dados — estão sendo
              movidas para o disco automaticamente.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Retenção de mídia</CardTitle>
          <CardDescription>
            Por quanto tempo guardar a mídia das conversas. Depois desse prazo o arquivo é
            apagado; a mensagem continua na conversa com o texto e a indicação de mídia
            expirada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            aria-label="Retenção de mídia"
            value={selected === null ? "" : String(selected)}
            disabled={!canEdit || saved === undefined || saving}
            onChange={(e) => setSelected(e.target.value === "" ? null : Number(e.target.value))}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-64"
          >
            {options.map((o) => (
              <option key={String(o.value)} value={o.value === null ? "" : String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
          {!canEdit && (
            <p className="text-xs text-muted-foreground">
              Só o proprietário pode alterar a retenção.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-brand-text">{notice}</p>}
          {canEdit && (
            <Button disabled={saving || selected === saved} onClick={() => void save()}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
