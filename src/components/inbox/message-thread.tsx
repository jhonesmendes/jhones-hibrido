"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Clock3,
  Download,
  FileText,
  Forward,
  Paperclip,
  Sparkles,
  ZoomIn,
} from "lucide-react";
import type { MessageDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/lib/media";
import { mediaLabel } from "./helpers";
import { MediaLightbox } from "./media-lightbox";
import { ForwardModal } from "./forward-modal";

function StatusTicks({ status }: { status: MessageDto["status"] }) {
  const cls = "h-[13px] w-[13px]";
  if (status === "pending") return <Clock3 className={cn(cls, "text-text-4")} strokeWidth={1.7} />;
  if (status === "sent") return <Check className={cn(cls, "text-text-4")} strokeWidth={1.7} />;
  if (status === "delivered")
    return <CheckCheck className={cn(cls, "text-text-4")} strokeWidth={1.7} />;
  if (status === "read")
    return <CheckCheck className={cn(cls, "text-brand")} strokeWidth={1.7} />;
  return <AlertTriangle className={cn(cls, "text-destructive")} strokeWidth={1.7} />;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
}

function bubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Mídia da conversa, servida pelo proxy autenticado do CRM (`/api/media/[id]`
 * — canal não oficial: bytes locais; canal oficial: baixados na ingestão,
 * ver ingest.ts). Imagem/vídeo abrem no lightbox; documento tem card com
 * baixar/encaminhar; ambos podem encaminhar.
 */
function MediaContent({
  m,
  onOpenLightbox,
  onForward,
}: {
  m: MessageDto;
  onOpenLightbox: () => void;
  onForward: () => void;
}) {
  if (!m.mediaUrl) {
    return (
      <span className="inline-flex items-center gap-1.5 text-text-3">
        <Paperclip className="h-3.5 w-3.5" strokeWidth={1.7} />
        {mediaLabel(m.type)}
        {m.text ? ` — ${m.text}` : ""}
      </span>
    );
  }

  if (m.type === "image" || m.type === "sticker") {
    return (
      <span className="block">
        <span
          className="group relative block cursor-pointer overflow-hidden rounded-md"
          onClick={onOpenLightbox}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={m.mediaUrl}
            alt={m.text ?? mediaLabel(m.type)}
            loading="lazy"
            className="max-h-72 max-w-full rounded-md"
          />
          <span className="absolute inset-0 hidden items-center justify-center gap-2 bg-black/30 group-hover:flex">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90">
              <ZoomIn className="h-4 w-4 text-foreground" strokeWidth={1.7} />
            </span>
          </span>
          {m.type !== "sticker" && (
            <span className="absolute right-1.5 top-1.5 flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onForward();
                }}
                aria-label="Encaminhar"
                className="flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80"
              >
                <Forward className="h-3 w-3" strokeWidth={1.7} />
              </button>
            </span>
          )}
        </span>
        {m.text && <span className="mt-1 block">{m.text}</span>}
      </span>
    );
  }

  if (m.type === "audio") {
    return <audio controls preload="none" src={m.mediaUrl} className="max-w-full" />;
  }

  if (m.type === "video") {
    return (
      <span className="block">
        <span className="group relative block cursor-pointer" onClick={onOpenLightbox}>
          <video
            controls={false}
            preload="metadata"
            src={m.mediaUrl}
            className="max-h-72 max-w-full rounded-md"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90">
              <ZoomIn className="h-4 w-4 text-foreground" strokeWidth={1.7} />
            </span>
          </span>
        </span>
        {m.text && <span className="mt-1 block">{m.text}</span>}
      </span>
    );
  }

  // document e demais tipos
  const sizeLabel = formatFileSize(m.sizeBytes);
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-tint">
        <FileText className="h-4.5 w-4.5 text-brand" strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <a
          href={m.mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate font-medium underline-offset-2 hover:underline"
        >
          {m.filename || m.text || mediaLabel(m.type)}
        </a>
        {sizeLabel && <span className="block text-xs text-text-3">{sizeLabel}</span>}
      </span>
      <span className="flex shrink-0 gap-1">
        <button
          onClick={onForward}
          aria-label="Encaminhar"
          className="rounded-md border p-1.5 text-text-3 hover:bg-accent hover:text-foreground"
        >
          <Forward className="h-3.5 w-3.5" strokeWidth={1.7} />
        </button>
        <a
          href={m.mediaUrl}
          download={m.filename ?? undefined}
          aria-label="Baixar"
          className="rounded-md border p-1.5 text-text-3 hover:bg-accent hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.7} />
        </a>
      </span>
    </span>
  );
}

/** Tipos exibidos em tela cheia no lightbox, com tira de miniaturas entre eles. */
const LIGHTBOX_TYPES = new Set(["image", "video", "sticker"]);

export function MessageThread({ messages }: { messages: MessageDto[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(null);

  const lightboxItems = messages.filter(
    (m) => m.mediaUrl && LIGHTBOX_TYPES.has(m.type)
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <div
      ref={scrollRef}
      className="chat-wallpaper flex flex-1 flex-col gap-[3px] overflow-y-auto px-[6%] py-5"
    >
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay =
          !prev ||
          new Date(prev.createdAt).toDateString() !==
            new Date(m.createdAt).toDateString();
        const grouped =
          !newDay && prev !== undefined && prev.direction === m.direction;
        const out = m.direction === "out";

        return (
          <div key={m.id}>
            {newDay && (
              <div className="my-3 flex justify-center">
                <span className="rounded-full border bg-background px-3 py-1 text-[11.5px] font-semibold text-text-2 shadow-sm">
                  {dayLabel(m.createdAt)}
                </span>
              </div>
            )}
            <div
              className={cn(
                "flex",
                out ? "justify-end" : "justify-start",
                grouped ? "mt-[3px]" : "mt-2.5"
              )}
            >
              <div
                className={cn(
                  "max-w-[64%] rounded-lg px-3 pb-1.5 pt-2 text-sm leading-[1.45] shadow-sm",
                  out
                    ? "border border-brand-soft bg-bubble-out text-bubble-out-text"
                    : "bg-background",
                  !grouped && (out ? "rounded-tr-[5px]" : "rounded-tl-[5px]")
                )}
              >
                {m.type === "text" || m.type === "template" ? (
                  <span className="whitespace-pre-wrap break-words">
                    {m.text}
                  </span>
                ) : (
                  <MediaContent
                    m={m}
                    onOpenLightbox={() =>
                      setLightboxIndex(lightboxItems.findIndex((it) => it.id === m.id))
                    }
                    onForward={() => setForwardMessageId(m.id)}
                  />
                )}
                <span className="float-right ml-2 mt-1 flex items-center gap-1">
                  {m.aiGenerated && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] font-medium text-brand"
                      title="Resposta gerada por IA"
                    >
                      <Sparkles className="h-3 w-3" strokeWidth={1.7} /> IA
                    </span>
                  )}
                  <span className="text-[10.5px] text-text-4">
                    {bubbleTime(m.createdAt)}
                  </span>
                  {out && <StatusTicks status={m.status} />}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {lightboxIndex !== null && lightboxItems[lightboxIndex] && (
        <MediaLightbox
          items={lightboxItems}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onForward={(m) => {
            setForwardMessageId(m.id);
            setLightboxIndex(null);
          }}
        />
      )}

      {forwardMessageId && (
        <ForwardModal
          messageId={forwardMessageId}
          onClose={() => setForwardMessageId(null)}
        />
      )}
    </div>
  );
}
