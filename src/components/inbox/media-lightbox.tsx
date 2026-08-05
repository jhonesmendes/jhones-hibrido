"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Download, Forward, X } from "lucide-react";
import type { MessageDto } from "@/lib/types";
import { formatFileSize } from "@/lib/media";
import { cn, downloadUrl } from "@/lib/utils";

export function MediaLightbox({
  items,
  index,
  onClose,
  onForward,
  onNavigate,
}: {
  items: MessageDto[];
  index: number;
  onClose: () => void;
  onForward: (m: MessageDto) => void;
  onNavigate: (index: number) => void;
}) {
  const current = items[index];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      if (e.key === "ArrowRight" && index < items.length - 1) onNavigate(index + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, items.length, onClose, onNavigate]);

  if (!current?.mediaUrl) return null;

  const isVideo = current.mimeType?.startsWith("video/") ?? false;
  const sizeLabel = formatFileSize(current.sizeBytes);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-2xl items-center justify-between"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-white/70">
          {current.filename ?? "Mídia"}
          {sizeLabel ? ` · ${sizeLabel}` : ""}
          {items.length > 1 ? ` · ${index + 1}/${items.length}` : ""}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onForward(current)}
            className="flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/25"
          >
            <Forward className="h-3.5 w-3.5" /> Encaminhar
          </button>
          <button
            onClick={() => void downloadUrl(current.mediaUrl!, current.filename ?? undefined)}
            className="flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/25"
          >
            <Download className="h-3.5 w-3.5" /> Baixar
          </button>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        className="relative flex w-full max-w-2xl items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {index > 0 && (
          <button
            onClick={() => onNavigate(index - 1)}
            aria-label="Mídia anterior"
            className="absolute left-1 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex max-h-[70vh] w-full items-center justify-center overflow-hidden rounded-lg">
          {isVideo ? (
            <video
              key={current.id}
              controls
              autoPlay
              src={current.mediaUrl}
              className="max-h-[70vh] max-w-full"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={current.id}
              src={current.mediaUrl}
              alt={current.filename ?? ""}
              className="max-h-[70vh] max-w-full object-contain"
            />
          )}
        </div>
        {index < items.length - 1 && (
          <button
            onClick={() => onNavigate(index + 1)}
            aria-label="Próxima mídia"
            className="absolute right-1 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {items.length > 1 && (
        <div
          className="flex w-full max-w-2xl gap-1.5 overflow-x-auto pb-1"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it, i) => (
            <button
              key={it.id}
              onClick={() => onNavigate(i)}
              className={cn(
                "h-14 w-14 shrink-0 overflow-hidden rounded-md border-2",
                i === index ? "border-white" : "border-transparent opacity-60 hover:opacity-90"
              )}
            >
              {it.mimeType?.startsWith("video/") ? (
                <video src={it.mediaUrl ?? undefined} className="h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.mediaUrl ?? undefined}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
