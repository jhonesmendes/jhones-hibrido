"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCENT_PRESETS, isValidHex, resolveAccentSet, type Branding } from "@/lib/branding";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BrandingClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [accent, setAccent] = useState("#3f5972");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { branding: Branding } | null) => {
        if (d) {
          setName(d.branding.name);
          setAccent(d.branding.accent);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const isPreset = accent.toLowerCase() in ACCENT_PRESETS;
  const previewSet = resolveAccentSet(accent);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/settings/branding", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), accent }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Não foi possível salvar");
      return;
    }
    setSaved(true);
    // Renderiza novamente a árvore do servidor (o layout raiz injeta o acento e o título)
    router.refresh();
  }

  if (!loaded) return <p className="text-sm text-text-3">Carregando…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Marca do CRM</CardTitle>
          <CardDescription>
            Este CRM é seu: coloque o nome do seu negócio e a sua cor. Elas
            aparecem em toda a interface e na tela de login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="brand-name">Nome</Label>
            <Input
              id="brand-name"
              maxLength={30}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vocero"
              className="max-w-xs"
            />
          </div>

          <div className="space-y-2">
            <Label>Cor de destaque</Label>
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(ACCENT_PRESETS).map(([hex, preset]) => (
                <button
                  key={hex}
                  onClick={() => setAccent(hex)}
                  title={preset.label}
                  aria-label={preset.label}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    accent.toLowerCase() === hex
                      ? "border-foreground/40 bg-secondary"
                      : "hover:bg-accent"
                  )}
                >
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{ background: hex }}
                  />
                  {preset.label}
                </button>
              ))}
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  !isPreset ? "border-foreground/40 bg-secondary" : "hover:bg-accent"
                )}
              >
                <input
                  type="color"
                  value={isValidHex(accent) ? accent : "#3f5972"}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-4 w-4 cursor-pointer appearance-none border-0 bg-transparent p-0"
                />
                Personalizado
              </label>
            </div>
            <p className="text-xs text-text-3">
              Com uma cor personalizada, os tons derivados (hover, fundos
              suaves) são calculados sozinhos e o contraste é ajustado.
            </p>
          </div>

          {/* Pré-visualização */}
          <div className="rounded-md border p-4" style={{ background: previewSet.tint }}>
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-[30px] w-[30px] items-center justify-center rounded-sm text-[15px] font-bold text-white"
                style={{ background: previewSet.accent }}
              >
                {(name.trim() || "Vocero").charAt(0).toUpperCase()}
              </span>
              <span>
                <span className="block text-[15px] font-[650] leading-tight">
                  {name.trim() || "Vocero"}
                </span>
                <span className="block text-[11px] text-text-3">CRM · WhatsApp</span>
              </span>
              <span className="flex-1" />
              <span
                className="rounded-md px-3 py-1.5 text-xs font-medium text-white"
                style={{ background: previewSet.accent }}
              >
                Botão de exemplo
              </span>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm" style={{ color: previewSet.text }}>Marca salva ✓</p>}
          <Button disabled={saving || !name.trim()} onClick={() => void save()}>
            {saving ? "Salvando…" : "Salvar marca"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
