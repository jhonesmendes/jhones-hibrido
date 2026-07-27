"use client";

import { useEffect, useState } from "react";
import type { StageDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FollowupConfig = {
  enabled: boolean;
  triggerStageId: string | null;
  intervalValue: number;
  intervalUnit: "hours" | "days";
  message: string | null;
  successStageId: string | null;
  expiredStageId: string | null;
  requiresDocument: boolean;
};

const DEFAULT_CONFIG: FollowupConfig = {
  enabled: false,
  triggerStageId: null,
  intervalValue: 4,
  intervalUnit: "hours",
  message: null,
  successStageId: null,
  expiredStageId: null,
  requiresDocument: false,
};

export function FollowupManager({
  stages,
  onClose,
}: {
  stages: StageDto[];
  onClose: () => void;
}) {
  const [config, setConfig] = useState<FollowupConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/pipeline/followup")
      .then((r) => (r.ok ? r.json() : DEFAULT_CONFIG))
      .then((d: FollowupConfig) => setConfig(d))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/pipeline/followup", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Não foi possível salvar");
      return;
    }
    setConfig((await res.json()) as FollowupConfig);
    setSaved(true);
  }

  const openStages = stages.filter((s) => s.kind === "open");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-semibold">Follow-up automático</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Envia uma mensagem sozinho quando um lead fica parado numa etapa sem
          responder. Nada aqui é fixo — tudo é configurável.
        </p>

        {!loaded ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, enabled: e.target.checked }))
                }
                className="accent-primary"
              />
              Habilitar follow-up automático
            </label>

            <div className="space-y-1.5">
              <Label htmlFor="fu-trigger">Etapa gatilho</Label>
              <select
                id="fu-trigger"
                value={config.triggerStageId ?? ""}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    triggerStageId: e.target.value || null,
                  }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">Selecione…</option>
                {openStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fu-interval">Intervalo</Label>
                <Input
                  id="fu-interval"
                  type="number"
                  min={1}
                  value={config.intervalValue}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      intervalValue: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fu-unit">Unidade</Label>
                <select
                  id="fu-unit"
                  value={config.intervalUnit}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      intervalUnit: e.target.value as "hours" | "days",
                    }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="hours">Horas</option>
                  <option value="days">Dias</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fu-message">Mensagem de follow-up</Label>
              <Textarea
                id="fu-message"
                rows={3}
                value={config.message ?? ""}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, message: e.target.value }))
                }
                placeholder="Olá! Ainda tem interesse? Posso ajudar com mais alguma coisa?"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.requiresDocument}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    requiresDocument: e.target.checked,
                  }))
                }
                className="accent-primary"
              />
              Aguarda o recebimento de um documento/imagem
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fu-success">
                  Etapa ao receber documento
                </Label>
                <select
                  id="fu-success"
                  value={config.successStageId ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      successStageId: e.target.value || null,
                    }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">Nenhuma</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fu-expired">
                  Etapa ao expirar sem resposta
                </Label>
                <select
                  id="fu-expired"
                  value={config.expiredStageId ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      expiredStageId: e.target.value || null,
                    }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">Nenhuma</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-text-3">
              O prazo de expiração é o mesmo intervalo do lembrete (ex.: 4h
              para lembrar + 4h de tolerância = 8h sem resposta até expirar).
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {saved && !error && (
              <p className="text-sm text-success">Configuração salva.</p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button disabled={!loaded || saving} onClick={() => void save()}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
