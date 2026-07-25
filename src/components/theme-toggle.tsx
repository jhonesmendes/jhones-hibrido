"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Alternador de tema: claro / escuro / sistema.
 * Persiste em localStorage ("vocero-theme"); o script anti-flash no
 * layout aplica a classe `dark` no <html> antes da hidratação.
 */

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "vocero-theme";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(mode: ThemeMode): void {
  const dark = mode === "dark" || (mode === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

const MODES: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Escuro", icon: Moon },
  { id: "system", label: "Sistema", icon: Monitor },
];

export function ThemeToggle() {
  // null até montar: evita divergência de hidratação (localStorage só no cliente).
  const [mode, setMode] = useState<ThemeMode | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    setMode(saved === "light" || saved === "dark" ? saved : "system");
  }, []);

  // Em modo "sistema", acompanha mudanças da preferência do SO em tempo real.
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  function select(next: ThemeMode) {
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema da interface"
      className="flex items-center gap-0.5 rounded-md border bg-secondary p-0.5"
    >
      {MODES.map((m) => (
        <button
          key={m.id}
          role="radio"
          aria-checked={mode === m.id}
          title={m.label}
          onClick={() => select(m.id)}
          className={cn(
            "flex flex-1 items-center justify-center rounded-[5px] py-1.5 transition-colors",
            mode === m.id
              ? "bg-background text-foreground shadow-sm"
              : "text-text-3 hover:text-text-2"
          )}
        >
          <m.icon className="h-[15px] w-[15px]" strokeWidth={1.7} />
        </button>
      ))}
    </div>
  );
}
