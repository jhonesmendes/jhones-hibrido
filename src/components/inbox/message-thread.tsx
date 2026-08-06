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
  Reply,
  Sparkles,
  ZoomIn,
} from "lucide-react";
import type { MessageDto } from "@/lib/types";
import { cn, downloadUrl } from "@/lib/utils";
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
  onMediaLoad,
}: {
  m: MessageDto;
  onOpenLightbox: () => void;
  onForward: () => void;
  /** Imagem/vídeo carrega depois do primeiro scroll pro fim — sem isso, a
   * altura real da mídia só entra em cena tarde demais e a conversa fica
   * "parada" acima da mensagem nova até o usuário rolar manualmente. */
  onMediaLoad: () => void;
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
            onLoad={onMediaLoad}
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
            onLoadedData={onMediaLoad}
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
        <button
          onClick={() => void downloadUrl(m.mediaUrl!, m.filename ?? undefined)}
          aria-label="Baixar"
          className="rounded-md border p-1.5 text-text-3 hover:bg-accent hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.7} />
        </button>
      </span>
    </span>
  );
}

/** Tipos exibidos em tela cheia no lightbox, com tira de miniaturas entre eles. */
const LIGHTBOX_TYPES = new Set(["image", "video", "sticker"]);

/** Resumo da mensagem citada — a original pode não estar mais carregada no
 * histórico visível (ex.: muito antiga); nesse caso mostra um aviso genérico
 * em vez de simplesmente sumir com a citação. */
function QuotedPreview({ target }: { target: MessageDto | null }) {
  if (!target) {
    return (
      <div className="mb-1 rounded border-l-2 border-text-4 bg-black/5 px-2 py-1 text-xs italic text-text-3">
        Mensagem original não encontrada
      </div>
    );
  }
  const label =
    target.type === "text" || target.type === "template"
      ? target.text
      : target.filename || mediaLabel(target.type);
  return (
    <div className="mb-1 rounded border-l-2 border-brand bg-black/5 px-2 py-1 text-xs text-text-2">
      <p className="line-clamp-2 break-words">{label}</p>
    </div>
  );
}

/** Assinatura de quem mandou (só faz sentido pra saída): agente humano
 * (`senderName`) tem prioridade — é informação real, gravada no envio;
 * `aiGenerated` sem `senderName` é a IA respondendo sozinha. Sem nenhum
 * dos dois (mensagem antiga, ou automação sem member associado): nada. */
function senderLabel(m: MessageDto, aiAgentName: string | null): string | null {
  if (m.direction !== "out") return null;
  if (m.senderName) return m.senderName;
  if (m.aiGenerated) return aiAgentName ?? "IA";
  return null;
}

export function MessageThread({
  messages,
  onReply,
  aiAgentName,
}: {
  messages: MessageDto[];
  onReply: (m: MessageDto) => void;
  /** Nome do agente IA configurado pra esta conversa — assinatura das
   * mensagens automáticas (ex.: "Bob"). `null` = ainda não resolvido ou
   * sem perfil de IA configurado (cai no rótulo genérico "IA"). */
  aiAgentName: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(null);
  // Só acompanha mensagem nova se o usuário já estava perto do fim — senão
  // puxaria a conversa pra baixo enquanto alguém rola pra cima lendo o
  // histórico. Começa true: ao abrir uma conversa, sempre vai pro fim.
  const nearBottomRef = useRef(true);

  const lightboxItems = messages.filter(
    (m) => m.mediaUrl && LIGHTBOX_TYPES.has(m.type)
  );
  const messageById = new Map(messages.map((m) => [m.id, m]));

  function scrollToBottomIfNear() {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  useEffect(() => {
    // messages.length === 0: acabou de trocar de conversa (o pai limpa a
    // lista antes de buscar a nova) — reseta pra sempre abrir no fim.
    if (messages.length === 0) {
      nearBottomRef.current = true;
      return;
    }
    scrollToBottomIfNear();
    // Mídia (imagem/vídeo) carrega DEPOIS deste efeito rodar — sem
    // reafirmar o scroll quando ela termina de carregar (onMediaLoad, mais
    // abaixo), a altura real só entra em cena tarde demais e a conversa
    // fica "parada" acima da mensagem nova.
  }, [messages]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="chat-wallpaper flex flex-1 flex-col gap-[3px] overflow-y-auto px-[6%] py-5"
    >
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay =
          !prev ||
          new Date(prev.createdAt).toDateString() !==
            new Date(m.createdAt).toDateString();
        const label = senderLabel(m, aiAgentName);
        // Não agrupa (reinicia o "cantinho" do balão) quando o remetente
        // muda dentro da mesma direção — senão duas mensagens de agentes
        // diferentes ficariam visualmente coladas como se fosse a mesma
        // pessoa falando.
        const grouped =
          !newDay &&
          prev !== undefined &&
          prev.direction === m.direction &&
          senderLabel(prev, aiAgentName) === label;
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
                {!grouped && label && (
                  <p
                    className={cn(
                      "mb-0.5 text-xs font-semibold",
                      m.aiGenerated && !m.senderName ? "text-sky-600" : "text-emerald-600"
                    )}
                  >
                    {label}
                  </p>
                )}
                {m.replyToMessageId && (
                  <QuotedPreview target={messageById.get(m.replyToMessageId) ?? null} />
                )}
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
                    onMediaLoad={scrollToBottomIfNear}
                  />
                )}
                <span className="float-right ml-2 mt-1 flex items-center gap-1">
                  <button
                    onClick={() => onReply(m)}
                    aria-label="Responder"
                    title="Responder"
                    className="rounded p-0.5 text-text-4 hover:bg-black/10 hover:text-foreground"
                  >
                    <Reply className="h-3 w-3" strokeWidth={1.7} />
                  </button>
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
