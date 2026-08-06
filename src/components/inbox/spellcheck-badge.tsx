"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { checkSpelling } from "@/lib/spellcheck-client";
import type { SpellcheckMatch } from "@/workers/spellcheck.worker";

/**
 * Contador clicável de possíveis erros de ortografia (PT-BR) — em vez de
 * sublinhar dentro do textarea (exigiria trocar por um editor mais
 * complexo), mostra um aviso discreto que só aparece quando há algo pra
 * corrigir. Debounce de 500ms: só checa depois que o agente para de
 * digitar, e descarta resposta de checagem obsoleta (`requestIdRef`) se o
 * texto já mudou de novo enquanto o worker respondia.
 */
export function SpellcheckBadge({
  text,
  onFix,
}: {
  text: string;
  /** Substitui o trecho [start, end) do texto pela sugestão escolhida. */
  onFix: (start: number, end: number, replacement: string) => void;
}) {
  const [matches, setMatches] = useState<SpellcheckMatch[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!text.trim()) {
      setMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      void checkSpelling(text).then((result) => {
        if (requestIdRef.current === requestId) setMatches(result);
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (matches.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-400"
        title="Possíveis erros de ortografia"
      >
        <AlertCircle className="h-3 w-3" strokeWidth={1.7} />
        {matches.length} {matches.length === 1 ? "possível erro" : "possíveis erros"}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1.5 w-64 overflow-hidden rounded-md border bg-background shadow-lg">
          <ul className="max-h-60 overflow-y-auto py-1">
            {matches.map((m) => (
              <li key={`${m.index}-${m.word}`} className="px-3 py-1.5">
                <p className="text-xs font-medium text-destructive line-through decoration-destructive/60">
                  {m.word}
                </p>
                {m.suggestions.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          onFix(m.index, m.index + m.word.length, s);
                          setOpen(false);
                        }}
                        className="rounded-full border bg-secondary px-2 py-0.5 text-[11px] text-text-2 hover:bg-accent"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-0.5 text-[11px] text-text-3">Sem sugestão</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
