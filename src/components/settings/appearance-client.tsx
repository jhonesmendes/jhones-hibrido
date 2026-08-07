"use client";

import { useEffect, useRef, useState } from "react";
import { Palette } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, initials } from "@/lib/utils";
import {
  CHAT_BG_PRESETS,
  PERSONAL_ACCENT_PRESETS,
  chatBgCssVariables,
  personalAccentCssVariables,
  resolvePersonalAccentSet,
} from "@/lib/branding";

type Appearance = {
  accentHex: string | null;
  accentIntensity: number | null;
  chatBg: string | null;
  chatBgIntensity: number | null;
};

const STYLE_TAG_ID = "personal-appearance-override";

/** Aplica (ou remove) o override ao vivo na página inteira — não só numa
 * caixinha de pré-visualização. Reusa exatamente as mesmas funções do SSR
 * (`personalAccentCssVariables`/`chatBgCssVariables`), então o que se vê
 * aqui é IDÊNTICO ao que vai persistir depois de salvo. */
function applyLive(appearance: Appearance) {
  let css = "";
  if (appearance.accentHex) {
    css += personalAccentCssVariables(appearance.accentHex, appearance.accentIntensity ?? 75);
  }
  if (appearance.chatBg) {
    css += chatBgCssVariables(appearance.chatBg, appearance.chatBgIntensity ?? 40) ?? "";
  }
  let tag = document.getElementById(STYLE_TAG_ID);
  if (!tag) {
    tag = document.createElement("style");
    tag.id = STYLE_TAG_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = css;
}

export function AppearanceClient() {
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/settings/appearance")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Appearance | null) => {
        const initial = d ?? { accentHex: null, accentIntensity: null, chatBg: null, chatBgIntensity: null };
        setAppearance(initial);
        applyLive(initial);
      })
      .catch(() =>
        setAppearance({ accentHex: null, accentIntensity: null, chatBg: null, chatBgIntensity: null })
      );
    // Ao sair desta tela, o override ao vivo já foi persistido (debounce
    // roda antes de qualquer navegação normal) — o próximo carregamento de
    // página pega o valor salvo via SSR, então não precisa desfazer aqui.
  }, []);

  function update(patch: Partial<Appearance>) {
    setAppearance((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      applyLive(next);
      setSaved(false);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void save(next), 500);
      return next;
    });
  }

  async function save(value: Appearance) {
    setSaving(true);
    const res = await fetch("/api/settings/appearance", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  if (!appearance) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  const accentIntensity = appearance.accentIntensity ?? 75;
  const bgIntensity = appearance.chatBgIntensity ?? 40;
  const previewSet = appearance.accentHex
    ? resolvePersonalAccentSet(appearance.accentHex, accentIntensity)
    : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Palette className="h-4 w-4 text-muted-foreground" /> Aparência pessoal
        </h2>
        <p className="text-sm text-muted-foreground">
          Ajustes visíveis só para você — não afetam outros agentes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cor de destaque</CardTitle>
          <CardDescription>
            Aplicada nos botões, links e elementos ativos da sua interface.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {PERSONAL_ACCENT_PRESETS.map((p) => (
              <button
                key={p.hex}
                type="button"
                title={p.label}
                aria-label={p.label}
                onClick={() => update({ accentHex: p.hex })}
                className={cn(
                  "h-[26px] w-[26px] shrink-0 rounded-full border-[2.5px] transition-transform hover:scale-110",
                  appearance.accentHex?.toLowerCase() === p.hex
                    ? "scale-[1.15] border-foreground"
                    : "border-transparent"
                )}
                style={{ background: p.hex }}
              />
            ))}
            <label
              title="Personalizado"
              className="relative h-[26px] w-[26px] shrink-0 cursor-pointer rounded-full border-2 border-dashed border-border-strong"
              style={{ background: "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)" }}
            >
              <input
                type="color"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={appearance.accentHex ?? "#2563eb"}
                onChange={(e) => update({ accentHex: e.target.value })}
              />
            </label>
            {appearance.accentHex && (
              <button
                type="button"
                onClick={() => update({ accentHex: null, accentIntensity: null })}
                className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Restaurar padrão
              </button>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-medium">Intensidade</p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Suave</span>
              <input
                type="range"
                min={30}
                max={100}
                value={accentIntensity}
                disabled={!appearance.accentHex}
                onChange={(e) => update({ accentIntensity: Number(e.target.value) })}
                className="flex-1 disabled:opacity-40"
              />
              <span className="text-xs text-muted-foreground">Vibrante</span>
              <span className="w-9 text-right text-xs text-muted-foreground">
                {accentIntensity}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Fundo do painel de conversa</CardTitle>
          <CardDescription>Cor de fundo por trás das mensagens, só na sua tela.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => update({ chatBg: null, chatBgIntensity: null })}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-md border p-2 text-[11px]",
                !appearance.chatBg ? "border-brand bg-brand-tint" : "hover:bg-accent"
              )}
            >
              <span className="h-8 w-8 rounded-md border bg-[var(--surface-0,var(--bg))]" />
              Padrão
            </button>
            {Object.entries(CHAT_BG_PRESETS).map(([id, p]) => (
              <button
                key={id}
                type="button"
                onClick={() => update({ chatBg: id })}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-md border p-2 text-[11px]",
                  appearance.chatBg === id ? "border-brand bg-brand-tint" : "hover:bg-accent"
                )}
              >
                <span className="h-8 w-8 rounded-md border" style={{ background: p.hex }} />
                {p.label}
              </button>
            ))}
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1.5 rounded-md border p-2 text-[11px]",
                appearance.chatBg?.startsWith("#") ? "border-brand bg-brand-tint" : "hover:bg-accent"
              )}
            >
              <span
                className="h-8 w-8 rounded-md border border-dashed"
                style={{
                  background: appearance.chatBg?.startsWith("#")
                    ? appearance.chatBg
                    : "conic-gradient(#fdf8f0,#f0f4fd,#f5f3ee)",
                }}
              />
              Personalizado
              <input
                type="color"
                className="absolute h-0 w-0 opacity-0"
                onChange={(e) => update({ chatBg: e.target.value })}
              />
            </label>
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-medium">Intensidade do fundo</p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Neutro</span>
              <input
                type="range"
                min={0}
                max={100}
                value={bgIntensity}
                disabled={!appearance.chatBg}
                onChange={(e) => update({ chatBgIntensity: Number(e.target.value) })}
                className="flex-1 disabled:opacity-40"
              />
              <span className="text-xs text-muted-foreground">Forte</span>
              <span className="w-9 text-right text-xs text-muted-foreground">{bgIntensity}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Pré-visualização</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="rounded-lg border p-4"
            style={{
              background: appearance.chatBg
                ? undefined
                : "var(--chat-bg)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
                style={{ background: previewSet?.accent ?? "var(--accent)" }}
              >
                {initials("Ana Lima")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">Ana Lima</p>
                <p className="text-[11px] text-muted-foreground">Atendimento · Online</p>
              </div>
              <Button
                size="sm"
                style={previewSet ? { background: previewSet.accent } : undefined}
              >
                Transferir
              </Button>
            </div>
            <div className="mt-2.5">
              <span
                className="inline-block rounded-md px-2.5 py-1.5 text-xs text-white"
                style={{ background: previewSet?.accent ?? "var(--accent)" }}
              >
                Olá! Como posso ajudar?
              </span>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {saving ? "Salvando…" : saved ? "Salvo ✓" : "Aplicado automaticamente ao ajustar"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
