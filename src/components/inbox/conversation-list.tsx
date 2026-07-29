"use client";

import { useState } from "react";
import { MessageSquarePlus, Search, Sparkles, UserRound, Zap } from "lucide-react";
import type { ConversationDto } from "@/lib/types";
import { cn, formatPhone, normalizePhoneInput } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { formatTime, previewText } from "./helpers";
import { HelpLink } from "@/components/docs/help-link";

const STAGE_DOT: Record<string, string> = {
  // pt-BR (novas organizações)
  Novo: "#9ca3af",
  "Em conversa": "#7b93b3",
  Interessado: "#b08b5e",
  Cliente: "#5f8f74",
  Perdido: "#a2504c",
  // es (dados legados)
  Nuevo: "#9ca3af",
  "En conversación": "#7b93b3",
  Interesado: "#b08b5e",
};

function EmptyState({ onSeeded }: { onSeeded: () => void }) {
  const [seeding, setSeeding] = useState(false);
  const [failed, setFailed] = useState(false);

  async function seed() {
    setSeeding(true);
    const res = await fetch("/api/seed/demo", { method: "POST" }).catch(
      () => null
    );
    setSeeding(false);
    if (res?.ok) onSeeded();
    else setFailed(true);
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium">Nenhuma conversa ainda</p>
      <p className="text-xs text-text-3">
        Quando alguém escrever para o seu número de WhatsApp, a conversa
        aparecerá aqui em tempo real.
      </p>
      {!failed && (
        <Button
          size="sm"
          variant="outline"
          disabled={seeding}
          onClick={() => void seed()}
        >
          <Sparkles className="h-4 w-4" strokeWidth={1.7} />
          {seeding ? "Carregando demo…" : "Carregar dados de demonstração"}
        </Button>
      )}
    </div>
  );
}

export function ConversationList({
  conversations: conversationsProp,
  selectedId,
  onSelect,
  onSeeded,
  onStartConversation,
}: {
  conversations: ConversationDto[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeeded: () => void;
  /**
   * Cria/abre a conversa de um número digitado na busca (estilo WhatsApp).
   * Retorna `false` em falha, para não limpar a busca e deixar o botão
   * reintentável.
   */
  onStartConversation: (phone: string) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [starting, setStarting] = useState(false);

  const loading = conversationsProp === null;
  const conversations = conversationsProp ?? [];
  const q = query.trim().toLowerCase();
  const searched = q
    ? conversations.filter(
        (c) =>
          c.contact.name.toLowerCase().includes(q) ||
          c.contact.phone.includes(q) ||
          (c.preview ?? "").toLowerCase().includes(q)
      )
    : conversations;
  const unreadCount = searched.filter((c) => c.unreadCount > 0).length;
  const visible =
    filter === "unread" ? searched.filter((c) => c.unreadCount > 0) : searched;

  // Busca parece um telefone → atalho "iniciar conversa" (como no WhatsApp).
  const phoneCandidate = normalizePhoneInput(query);

  async function startConversation() {
    if (!phoneCandidate || starting) return;
    setStarting(true);
    try {
      const ok = await onStartConversation(phoneCandidate);
      if (ok) setQuery("");
    } finally {
      setStarting(false);
    }
  }

  const startButton = phoneCandidate && (
    <div className="px-4 py-3">
      <button
        onClick={() => void startConversation()}
        disabled={starting}
        className="flex w-full items-center gap-3 rounded-md border border-dashed px-3 py-2.5 text-left text-sm transition-colors hover:border-brand hover:bg-brand-tint"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
          <MessageSquarePlus className="h-4 w-4" strokeWidth={1.7} />
        </span>
        <span className="min-w-0">
          <span className="block font-medium">
            {starting ? "Abrindo conversa…" : "Iniciar conversa"}
          </span>
          <span className="block text-xs text-text-3">
            com {formatPhone(phoneCandidate)}
          </span>
        </span>
      </button>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-4 pb-3 pt-4">
        <div className="mb-3 flex items-baseline gap-2">
          <h2 className="text-[17px] font-[650] tracking-tight">Caixa de entrada</h2>
          <span className="text-sm text-text-3">{conversations.length}</span>
          <HelpLink slug="inbox" />
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-secondary px-3 py-[7px] transition-colors focus-within:border-brand focus-within:bg-background focus-within:ring-[3px] focus-within:ring-brand-soft">
          <Search className="h-4 w-4 shrink-0 text-text-3" strokeWidth={1.7} />
          <input
            placeholder="Buscar conversa…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-text-3"
          />
        </div>
      </header>

      <div className="flex gap-1.5 border-b px-4 py-2.5">
        {(
          [
            { id: "all", label: "Todas", count: searched.length },
            { id: "unread", label: "Não lidas", count: unreadCount },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-[5px] text-[12.5px] font-medium transition-colors",
              filter === f.id
                ? "border-brand bg-brand text-white"
                : "bg-background text-text-2 hover:bg-accent"
            )}
          >
            {f.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px]",
                filter === f.id ? "bg-white/20" : "bg-secondary text-text-3"
              )}
            >
              {f.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {startButton}
        {loading ? (
          <p className="p-6 text-center text-xs text-text-3">Carregando…</p>
        ) : conversations.length === 0 ? (
          <EmptyState onSeeded={onSeeded} />
        ) : visible.length === 0 ? (
          <p className="p-6 text-center text-xs text-text-3">
            Nenhum resultado para este filtro.
          </p>
        ) : (
          <ul>
            {visible.map((c) => {
              const unread = c.unreadCount > 0;
              const active = selectedId === c.id;
              return (
                <li key={c.id} className="relative border-b border-border/70">
                  {active && (
                    <span className="absolute inset-y-0 left-0 w-[3px] bg-brand" />
                  )}
                  <button
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      "flex w-full items-start gap-[11px] px-4 py-[var(--row-py)] text-left transition-colors",
                      active ? "bg-[var(--bg-active)]" : "hover:bg-subtle"
                    )}
                  >
                    <span className="relative shrink-0">
                      <ContactAvatar name={c.contact.name} seed={c.contact.id} size="lg" />
                      {c.windowOpen && (
                        <span className="absolute bottom-0 right-0 h-[11px] w-[11px] rounded-full border-[2.5px] border-background bg-success" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-sm",
                            unread ? "font-[680]" : "font-semibold"
                          )}
                        >
                          {c.contact.name}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[11.5px]",
                            unread ? "font-semibold text-brand" : "text-text-3"
                          )}
                        >
                          {formatTime(c.lastMessageAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-[13px]",
                            unread ? "font-medium text-text-2" : "text-text-3"
                          )}
                        >
                          {previewText(c.preview)}
                        </span>
                        {unread && (
                          <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[10.5px] font-semibold text-white">
                            {c.unreadCount}
                          </span>
                        )}
                      </span>
                      <span className="mt-1.5 flex items-center gap-1.5">
                        {c.stageName && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border bg-secondary px-2 py-0.5 text-[11px] text-text-2">
                            <span
                              className="h-[7px] w-[7px] rounded-full"
                              style={{
                                background: STAGE_DOT[c.stageName] ?? "#9ca3af",
                              }}
                            />
                            {c.stageName}
                          </span>
                        )}
                        {c.channel === "unofficial" && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#d6dcec] bg-[#f2f5fb] px-2 py-0.5 text-[11px] text-[#5a6c99]">
                            <Zap className="h-3 w-3" strokeWidth={1.7} />
                            WhatsApp Web
                          </span>
                        )}
                        {c.handoffAt && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#ece2cf] bg-[#faf7f0] px-2 py-0.5 text-[11px] text-[#8a6d3b]">
                            <UserRound className="h-3 w-3" strokeWidth={1.7} />
                            Atendimento humano
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
