"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Clock3, Mic, Paperclip, Send, Square, Wifi } from "lucide-react";
import type { ConversationDto, TemplateDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatRemaining } from "./helpers";
import { TemplateSender } from "./template-sender";

type ChannelType = "official" | "unofficial";

const CHANNEL_LABEL: Record<ChannelType, string> = {
  official: "Oficial",
  unofficial: "WhatsApp Web",
};

/** Mesmo teto do backend (`src/app/api/conversations/[id]/media/route.ts`). */
const MAX_MEDIA_FILE_BYTES = 16 * 1024 * 1024;

export function Composer({
  conversation,
  onSend,
  onSendMedia,
  onSent,
}: {
  conversation: ConversationDto;
  onSend: (text: string, channel?: ChannelType) => Promise<string | null>;
  onSendMedia: (file: File, channel?: ChannelType) => Promise<string | null>;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [pickerIndex, setPickerIndex] = useState(0);
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const [availableChannels, setAvailableChannels] = useState<
    Record<ChannelType, boolean>
  >({ official: false, unofficial: false });
  const [channelOverride, setChannelOverride] = useState<ChannelType | null>(
    null
  );
  const taRef = useRef<HTMLTextAreaElement>(null);

  const effectiveChannel = channelOverride ?? conversation.channel;
  const bothConnected = availableChannels.official && availableChannels.unofficial;

  // Atalho "/" (primeiro caractere, sem espaço ainda) abre o seletor de modelos.
  const slashMatch = /^\/(\S*)$/.exec(text);
  const pickerQuery = slashMatch?.[1] ?? null;
  const pickerResults =
    pickerQuery !== null
      ? templates.filter((t) =>
          t.name.toLowerCase().includes(pickerQuery.toLowerCase())
        )
      : [];
  const showPicker = pickerQuery !== null && !pickerDismissed;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d: { templates?: TemplateDto[] }) => {
        if (!cancelled)
          setTemplates((d.templates ?? []).filter((t) => t.status === "approved"));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/channels/available")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Record<ChannelType, boolean> | null) => {
        if (!cancelled && d) setAvailableChannels(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Override é pontual: some ao trocar de conversa, voltando ao canal sticky.
  useEffect(() => {
    setChannelOverride(null);
  }, [conversation.id]);

  function autogrow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  /**
   * Insere o corpo do modelo e deixa a primeira variável numerada
   * selecionada — escrever por cima a substitui; não tocando, ela vai no
   * envio como está (FR-004).
   */
  function applyTemplate(t: TemplateDto) {
    setText(t.body);
    setPickerDismissed(true);
    setTimeout(() => {
      autogrow();
      const el = taRef.current;
      if (!el) return;
      el.focus();
      const variable = /\{\{\s*\d+\s*\}\}/.exec(t.body);
      if (variable) {
        el.setSelectionRange(variable.index, variable.index + variable[0].length);
      } else {
        el.setSelectionRange(t.body.length, t.body.length);
      }
    }, 0);
  }

  async function submit() {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setError(null);
    const err = await onSend(value, channelOverride ?? undefined);
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    setText("");
    if (taRef.current) taRef.current.style.height = "auto";
  }

  async function submitFile(file: File) {
    if (sending) return;
    if (file.size > MAX_MEDIA_FILE_BYTES) {
      setError("Arquivo maior que o permitido (16MB)");
      return;
    }
    setSending(true);
    setError(null);
    const err = await onSendMedia(file, channelOverride ?? undefined);
    setSending(false);
    if (err) setError(err);
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void submitFile(file);
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const file = new File([blob], `audio-${Date.now()}.webm`, {
          type: blob.type,
        });
        void submitFile(file);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Não foi possível acessar o microfone");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }

  // O canal não oficial não tem janela de 24h; um override pontual para ele
  // libera texto livre mesmo com a janela oficial (sticky) fechada.
  const showFreeText = effectiveChannel === "unofficial" || conversation.windowOpen;

  const channelSelector = bothConnected && (
    <div className="mb-2.5 flex items-center gap-1.5">
      <span className="text-[11px] text-text-3">Enviar via:</span>
      {(["official", "unofficial"] as const).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setChannelOverride(c === conversation.channel ? null : c)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            effectiveChannel === c
              ? "border-brand bg-brand-tint text-brand-text"
              : "border-border bg-transparent text-text-3 hover:text-foreground"
          )}
        >
          {c === "official" ? (
            <BadgeCheck className="h-3 w-3" />
          ) : (
            <Wifi className="h-3 w-3" />
          )}
          {CHANNEL_LABEL[c]}
        </button>
      ))}
    </div>
  );

  if (!showFreeText) {
    return (
      <div className="border-t bg-background px-[18px] py-3.5">
        {channelSelector}
        <div className="mb-3 flex items-start gap-2 rounded-md border border-[#ece2cf] bg-[#faf7f0] p-3 text-sm text-[#8a6d3b]">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.7} />
          <div>
            <p className="font-medium">A janela de 24 horas está fechada.</p>
            <p className="opacity-80">
              O WhatsApp só permite texto livre dentro das 24 horas seguintes
              à última mensagem do cliente. Para retomar a conversa, envie um
              modelo aprovado{bothConnected ? ", ou envie pelo WhatsApp Web acima" : ""}.
            </p>
          </div>
        </div>
        <TemplateSender conversationId={conversation.id} onSent={onSent} />
      </div>
    );
  }

  return (
    <div className="border-t bg-background px-[18px] pb-3.5 pt-3">
      {channelSelector}
      {templates.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {templates.slice(0, 4).map((t) => (
            <button
              key={t.id}
              className="rounded-full border bg-secondary px-3 py-1 text-xs font-medium text-text-2 transition-colors hover:border-brand-soft hover:bg-brand-tint hover:text-brand-text"
              onClick={() => applyTemplate(t)}
              title={t.body}
            >
              {t.name.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        {showPicker && (
          <div className="absolute bottom-full left-0 mb-1.5 w-full max-w-sm overflow-hidden rounded-md border bg-background shadow-lg">
            {pickerResults.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-text-3">
                Nenhum modelo encontrado.
              </p>
            ) : (
              <ul className="max-h-56 overflow-y-auto py-1">
                {pickerResults.map((t, i) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => applyTemplate(t)}
                      onMouseEnter={() => setPickerIndex(i)}
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm",
                        i === Math.min(pickerIndex, pickerResults.length - 1)
                          ? "bg-brand-tint"
                          : "hover:bg-secondary"
                      )}
                    >
                      <span className="font-medium">
                        {t.name.replace(/_/g, " ")}
                      </span>
                      <span className="line-clamp-1 text-xs text-text-3">
                        {t.body}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-md border bg-background px-3 py-2 transition-shadow focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand-soft">
          <input
            ref={fileInputRef}
            type="file"
            onChange={onFilePicked}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || recording}
            aria-label="Anexar arquivo"
            title="Anexar arquivo"
            className={cn(
              "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] text-text-3 hover:bg-accent hover:text-foreground",
              (sending || recording) && "opacity-40"
            )}
          >
            <Paperclip className="h-4 w-4" strokeWidth={1.7} />
          </button>
          <textarea
            ref={taRef}
            placeholder="Escreva uma resposta… (dica: use / para inserir um modelo)"
            value={text}
            rows={1}
            onChange={(e) => {
              setText(e.target.value);
              setPickerIndex(0);
              setPickerDismissed(false);
              autogrow();
            }}
            onKeyDown={(e) => {
              if (showPicker && pickerResults.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setPickerIndex((i) => Math.min(i + 1, pickerResults.length - 1));
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setPickerIndex((i) => Math.max(i - 1, 0));
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const chosen = pickerResults[Math.min(pickerIndex, pickerResults.length - 1)];
                  if (chosen) applyTemplate(chosen);
                  return;
                }
              }
              if (showPicker && e.key === "Escape") {
                e.preventDefault();
                setPickerDismissed(true);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            className="max-h-[120px] w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-text-3"
          />
          {text.trim().length === 0 ? (
            <button
              onClick={() => void (recording ? stopRecording() : startRecording())}
              disabled={sending}
              aria-label={recording ? "Parar gravação" : "Gravar áudio"}
              title={recording ? "Parar gravação" : "Gravar áudio"}
              className={cn(
                "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] transition-opacity",
                recording
                  ? "animate-pulse bg-destructive text-white"
                  : "text-text-3 hover:bg-accent hover:text-foreground",
                sending && "opacity-40"
              )}
            >
              {recording ? (
                <Square className="h-4 w-4" strokeWidth={1.7} />
              ) : (
                <Mic className="h-4 w-4" strokeWidth={1.7} />
              )}
            </button>
          ) : (
            <button
              onClick={() => void submit()}
              disabled={sending || text.trim().length === 0}
              aria-label="Enviar"
              className={cn(
                "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-brand text-white transition-opacity hover:bg-brand-hover",
                (sending || !text.trim()) && "opacity-40"
              )}
            >
              <Send className="h-4 w-4" strokeWidth={1.7} />
            </button>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        {error ? <p className="text-xs text-destructive">{error}</p> : <span />}
        <p className="text-[11px] text-text-3">
          {effectiveChannel === "unofficial"
            ? "WhatsApp Web · sem janela de 24h"
            : `Janela aberta · restam ${formatRemaining(conversation.windowRemainingMs)}`}
          {channelOverride && channelOverride !== conversation.channel && (
            <span className="ml-1 text-brand-text">(override manual)</span>
          )}
        </p>
      </div>
    </div>
  );
}
