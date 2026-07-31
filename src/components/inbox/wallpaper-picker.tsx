"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mini galeria de texturas do fundo de mensagens (4 modelos).
 * Persiste em localStorage ("vocero-chat-wallpaper") e aplica via atributo
 * `data-wallpaper` na <html> (lido pelo CSS em globals.css); o script
 * anti-flash no layout aplica o valor salvo antes da hidratação.
 */

export type WallpaperId = "icons" | "lines" | "emojis" | "objects";

const STORAGE_KEY = "vocero-chat-wallpaper";
const DEFAULT_ID: WallpaperId = "icons";

const OPTIONS: { id: WallpaperId; label: string }[] = [
  { id: "icons", label: "Ícones outline" },
  { id: "lines", label: "Linhas geométricas" },
  { id: "emojis", label: "Emojis" },
  { id: "objects", label: "Objetos aleatórios" },
];

export function applyWallpaper(id: WallpaperId): void {
  if (id === DEFAULT_ID) document.documentElement.removeAttribute("data-wallpaper");
  else document.documentElement.setAttribute("data-wallpaper", id);
}

export function WallpaperPicker() {
  const [id, setId] = useState<WallpaperId | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as WallpaperId | null;
    setId(saved && OPTIONS.some((o) => o.id === saved) ? saved : DEFAULT_ID);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function select(next: WallpaperId) {
    setId(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyWallpaper(next);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Textura do fundo de mensagens"
        title="Textura do fundo"
        className="rounded-sm border p-1.5 text-text-3 hover:bg-accent hover:text-foreground"
      >
        <Palette className="h-4 w-4" strokeWidth={1.7} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Escolher textura do fundo"
          className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-md border bg-background p-2.5 shadow-pop"
        >
          <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-3">
            Fundo da conversa
          </p>
          <div className="grid grid-cols-2 gap-2">
            {OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="menuitemradio"
                aria-checked={id === o.id}
                onClick={() => select(o.id)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors",
                  id === o.id ? "border-brand" : "border-border hover:border-border-strong"
                )}
              >
                <span
                  className={cn(
                    "relative flex h-12 w-full items-center justify-center overflow-hidden rounded-sm border border-border",
                    `wallpaper-swatch-${o.id}`
                  )}
                >
                  {id === o.id && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand">
                      <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-text-2">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
