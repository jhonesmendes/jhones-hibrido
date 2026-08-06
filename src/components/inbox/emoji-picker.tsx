"use client";

import { useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Grade fixa de emojis comuns — sem depender de nenhum serviço externo nem
 * CDN de imagens (Constituição II): são só caracteres Unicode, a fonte do
 * próprio sistema operacional desenha o desenho. Curada, não exaustiva —
 * cobre o uso típico de atendimento sem inflar o bundle com milhares de
 * emojis raros.
 */
const CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Frequentes",
    emojis: [
      "😀", "😂", "🙂", "😉", "😊", "😍", "😘", "😎", "🤔", "😅",
      "😢", "😭", "😡", "😱", "🙏", "👍", "👎", "👏", "🙌", "💪",
    ],
  },
  {
    label: "Gestos",
    emojis: [
      "👋", "✌️", "🤝", "👌", "🤞", "☝️", "👆", "👇", "👉", "👈",
      "✋", "🤚", "💯", "🔥", "✨", "⭐", "🎉", "🎊", "❤️", "💚",
    ],
  },
  {
    label: "Trabalho",
    emojis: [
      "✅", "❌", "⚠️", "❗", "❓", "💰", "📦", "📄", "📅", "⏰",
      "📍", "📞", "✉️", "💬", "🔧", "🛠️", "📈", "📉", "🏢", "🚚",
    ],
  },
];

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Inserir emoji"
        title="Inserir emoji"
        className={cn(
          "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] text-text-3 hover:bg-accent hover:text-foreground",
          open && "bg-accent text-foreground"
        )}
      >
        <Smile className="h-4 w-4" strokeWidth={1.7} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1.5 w-72 overflow-hidden rounded-md border bg-background shadow-lg">
          <div className="max-h-64 overflow-y-auto p-2">
            {CATEGORIES.map((cat) => (
              <div key={cat.label} className="mb-2 last:mb-0">
                <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-text-3">
                  {cat.label}
                </p>
                <div className="grid grid-cols-8 gap-0.5">
                  {cat.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onSelect(emoji);
                        setOpen(false);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded text-lg hover:bg-accent"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
