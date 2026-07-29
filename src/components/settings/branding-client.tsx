"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import {
  ACCENT_PRESETS,
  isValidHex,
  MAX_LOGO_DATA_URI_LENGTH,
  resolveAccentSet,
  resolveDarkAccentSet,
  type Branding,
} from "@/lib/branding";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpLink } from "@/components/docs/help-link";

/** Observa a classe `dark` no <html> (ThemeToggle a alterna sem reload). */
function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    setIsDark(root.classList.contains("dark"));
    const observer = new MutationObserver(() =>
      setIsDark(root.classList.contains("dark"))
    );
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

const MAX_LOGO_FILE_BYTES = 170_000;

export function BrandingClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [accent, setAccent] = useState("#3f5972");
  const [logo, setLogo] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const isDark = useIsDarkMode();

  useEffect(() => {
    fetch("/api/settings/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { branding: Branding } | null) => {
        if (d) {
          setName(d.branding.name);
          setAccent(d.branding.accent);
          setLogo(d.branding.logo);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const isPreset = accent.toLowerCase() in ACCENT_PRESETS;
  // Corrigido: o preview segue o tema atual — antes usava sempre o conjunto
  // claro, que ficava "estourado" (cores claras demais) em cima do fundo escuro.
  const previewSet = isDark ? resolveDarkAccentSet(accent) : resolveAccentSet(accent);

  function onLogoSelected(file: File) {
    setError(null);
    if (file.size > MAX_LOGO_FILE_BYTES) {
      setError("Imagem grande demais — use até ~170KB (ícone simples, não uma foto).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      if (dataUri.length > MAX_LOGO_DATA_URI_LENGTH) {
        setError("Imagem grande demais — use até ~170KB (ícone simples, não uma foto).");
        return;
      }
      setLogo(dataUri);
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/settings/branding", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), accent, logo }),
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
          <div className="flex items-center justify-between">
            <CardTitle>Marca do CRM</CardTitle>
            <HelpLink slug="marca" />
          </div>
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
            <Label>Ícone da empresa</Label>
            <div className="flex items-center gap-3">
              <span
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center overflow-hidden rounded-md text-base font-bold text-white"
                style={{ background: previewSet.accent }}
              >
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" className="h-full w-full object-cover" />
                ) : (
                  (name.trim() || "Vocero").charAt(0).toUpperCase()
                )}
              </span>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-accent">
                <Upload className="h-3.5 w-3.5" />
                {logo ? "Trocar ícone" : "Enviar ícone"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onLogoSelected(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {logo && (
                <button
                  type="button"
                  onClick={() => setLogo(null)}
                  className="flex items-center gap-1 text-[12.5px] text-text-3 hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" /> Remover
                </button>
              )}
            </div>
            <p className="text-xs text-text-3">
              PNG, JPEG, WebP ou SVG · até ~170KB. Sem ícone, a inicial do
              nome aparece no lugar (como hoje).
            </p>
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

          {/* Pré-visualização — segue o tema atual (claro/escuro) */}
          <div className="rounded-md border p-4" style={{ background: previewSet.tint }}>
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-sm text-[15px] font-bold text-white"
                style={{ background: previewSet.accent }}
              >
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" className="h-full w-full object-cover" />
                ) : (
                  (name.trim() || "Vocero").charAt(0).toUpperCase()
                )}
              </span>
              <span>
                <span
                  className="block text-[15px] font-[650] leading-tight"
                  style={{ color: previewSet.text }}
                >
                  {name.trim() || "Vocero"}
                </span>
                <span className="block text-[11px]" style={{ color: previewSet.text, opacity: 0.7 }}>
                  Vocero CRM · WhatsApp
                </span>
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
