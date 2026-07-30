"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import type { ConversationDto, MessageDto } from "@/lib/types";
import { useEvents } from "@/components/use-events";
import {
  getNotificationPermission,
  playNotificationSound,
  requestNotificationPermission,
  showMessageNotification,
} from "@/lib/notifications";
import { mediaLabel } from "./helpers";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { Composer } from "./composer";
import { ContactPanel } from "./contact-panel";

export function InboxClient() {
  const [conversations, setConversations] = useState<ConversationDto[] | null>(
    null
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  // É incrementado a cada evento SSE que pode mudar a etapa/lead ou o
  // estado do agente: o painel de detalhes observa isso e refaz o fetch ao vivo.
  const [detailRev, setDetailRev] = useState(0);
  const [notifPermission, setNotifPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");

  useEffect(() => {
    setPanelOpen(localStorage.getItem("vocero.panelOpen") !== "false");
    setNotifPermission(getNotificationPermission());
  }, []);

  const enableNotifications = useCallback(() => {
    void requestNotificationPermission().then(setNotifPermission);
  }, []);
  const togglePanel = useCallback((open: boolean) => {
    setPanelOpen(open);
    localStorage.setItem("vocero.panelOpen", String(open));
  }, []);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const lastFetchRef = useRef<string | null>(null);

  const refetchConversations = useCallback(async () => {
    const res = await fetch("/api/conversations").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { conversations: ConversationDto[] };
    setConversations(data.conversations);
    lastFetchRef.current = new Date().toISOString();
  }, []);

  const refetchMessages = useCallback(async (conversationId: string) => {
    const res = await fetch(
      `/api/conversations/${conversationId}/messages`
    ).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { messages: MessageDto[] };
    if (selectedIdRef.current === conversationId) setMessages(data.messages);
  }, []);

  useEffect(() => {
    void refetchConversations();
  }, [refetchConversations]);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      setMessages([]);
      void refetchMessages(id);
      void fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markRead: true }),
      });
    },
    [refetchMessages]
  );

  // Link direto a partir de Contatos/Pipeline: /inbox?contact=<id>
  const searchParams = useSearchParams();
  const contactParam = searchParams.get("contact");
  useEffect(() => {
    if (!contactParam || selectedIdRef.current) return;
    const match = conversations?.find((c) => c.contact.id === contactParam);
    if (match) select(match.id);
  }, [contactParam, conversations, select]);

  useEvents({
    onMessageNew: ({ conversationId, message }) => {
      const m = message as MessageDto;
      const isFocusedOnThisConversation =
        selectedIdRef.current === conversationId &&
        typeof document !== "undefined" &&
        !document.hidden;

      if (selectedIdRef.current === conversationId) {
        setMessages((prev) =>
          prev.some((x) => x.id === m.id) ? prev : [...prev, m]
        );
        void fetch(`/api/conversations/${conversationId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ markRead: true }),
        });
      }

      // Alerta (som + notificação do navegador) igual ao WhatsApp Web: só
      // pra mensagem recebida (não pro nosso próprio eco) e só quando não
      // se está olhando exatamente essa conversa em foco.
      if (m.direction === "in" && !isFocusedOnThisConversation) {
        playNotificationSound();
        const contact = conversations?.find((c) => c.id === conversationId)
          ?.contact;
        const body =
          m.type === "text" || m.type === "template"
            ? (m.text ?? "")
            : mediaLabel(m.type);
        showMessageNotification(
          contact?.name ?? "Nova mensagem",
          body,
          contact ? `/api/contacts/${contact.id}/avatar` : undefined
        );
      }

      void refetchConversations();
      // Uma mensagem recebida nova pode criar/mover o lead: atualiza o painel.
      setDetailRev((v) => v + 1);
    },
    onMessageStatus: ({ conversationId, messageId, status }) => {
      if (selectedIdRef.current !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, status: status as MessageDto["status"] } : m
        )
      );
    },
    onConversationUpdated: () => {
      void refetchConversations();
      // O agente mudou de etapa ou alterou o handoff: atualiza o painel ao vivo.
      setDetailRev((v) => v + 1);
    },
    onReconnect: () => {
      // Catch-up após reconexão (contrato sse.md): refetch completo.
      void refetchConversations();
      if (selectedIdRef.current) void refetchMessages(selectedIdRef.current);
      setDetailRev((v) => v + 1);
    },
  });

  // Esc fecha a conversa aberta (mesmo atalho do WhatsApp Web) — respeita
  // `defaultPrevented`, então não interfere no Esc que o composer já usa
  // pra fechar o dropdown de templates.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setSelectedId(null);
      setMessages([]);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const selected = conversations?.find((c) => c.id === selectedId) ?? null;

  const sendText = useCallback(
    async (
      text: string,
      channel?: "official" | "unofficial"
    ): Promise<string | null> => {
      if (!selectedIdRef.current) return "Nenhuma conversa selecionada";
      const res = await fetch(
        `/api/conversations/${selectedIdRef.current}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, channel }),
        }
      ).catch(() => null);
      if (!res) return "Sem conexão com o servidor";
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        return data?.error?.message ?? "Não foi possível enviar a mensagem";
      }
      if (selectedIdRef.current) void refetchMessages(selectedIdRef.current);
      void refetchConversations();
      return null;
    },
    [refetchMessages, refetchConversations]
  );

  const sendMedia = useCallback(
    async (
      file: File,
      channel?: "official" | "unofficial"
    ): Promise<string | null> => {
      if (!selectedIdRef.current) return "Nenhuma conversa selecionada";
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.slice(result.indexOf(",") + 1));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      }).catch(() => null);
      if (dataBase64 === null) return "Não foi possível ler o arquivo";

      const res = await fetch(
        `/api/conversations/${selectedIdRef.current}/media`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            dataBase64,
            mimeType: file.type || "application/octet-stream",
            filename: file.name,
            channel,
          }),
        }
      ).catch(() => null);
      if (!res) return "Sem conexão com o servidor";
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        return data?.error?.message ?? "Não foi possível enviar o arquivo";
      }
      if (selectedIdRef.current) void refetchMessages(selectedIdRef.current);
      void refetchConversations();
      return null;
    },
    [refetchMessages, refetchConversations]
  );

  const startConversation = useCallback(
    async (phone: string): Promise<boolean> => {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      }).catch(() => null);
      if (!res?.ok) return false;
      const data = (await res.json()) as { conversation: ConversationDto };
      await refetchConversations();
      select(data.conversation.id);
      return true;
    },
    [refetchConversations, select]
  );

  const patchConversation = useCallback(
    async (patch: {
      aiEnabled?: boolean;
      reactivate?: boolean;
      channel?: "official" | "unofficial";
    }) => {
      if (!selectedIdRef.current) return;
      await fetch(`/api/conversations/${selectedIdRef.current}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => null);
      void refetchConversations();
    },
    [refetchConversations]
  );

  return (
    <div className="flex h-full">
      <section className="w-[360px] shrink-0 overflow-hidden border-r">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={select}
          onSeeded={() => void refetchConversations()}
          onStartConversation={startConversation}
          notificationPermission={notifPermission}
          onEnableNotifications={enableNotifications}
        />
      </section>

      <section className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <header className="flex items-center justify-between border-b bg-background px-4 py-2.5">
              <div className="flex items-center gap-3">
                <ContactAvatar
                  name={selected.contact.name}
                  seed={selected.contact.id}
                  size="md"
                />
                <div>
                  <p className="text-[15px] font-[650] leading-tight">
                    {selected.contact.name}
                  </p>
                  <p
                    className={
                      selected.windowOpen
                        ? "text-xs font-medium text-success"
                        : "text-xs text-text-3"
                    }
                  >
                    {selected.windowOpen
                      ? "janela aberta"
                      : `+${selected.contact.phone}`}
                  </p>
                </div>
              </div>
              {!panelOpen && (
                <button
                  onClick={() => togglePanel(true)}
                  aria-label="Mostrar detalhes"
                  className="rounded-sm border p-1.5 text-text-3 hover:bg-accent hover:text-foreground"
                >
                  <PanelRight className="h-4 w-4" strokeWidth={1.7} />
                </button>
              )}
            </header>
            <MessageThread messages={messages} />
            <Composer
              conversation={selected}
              onSend={sendText}
              onSendMedia={sendMedia}
              onSent={() => {
                if (selectedIdRef.current)
                  void refetchMessages(selectedIdRef.current);
                void refetchConversations();
              }}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center bg-chat text-sm text-text-3">
            Escolha uma conversa para ver as mensagens
          </div>
        )}
      </section>

      <section
        className={cn(
          "shrink-0 overflow-hidden border-l transition-[width] duration-[220ms]",
          panelOpen && selected ? "w-[320px]" : "w-0 border-l-0"
        )}
      >
        {selected && (
          <div className="h-full w-[320px]">
            <ContactPanel
              conversation={selected}
              refreshKey={detailRev}
              onPatchConversation={patchConversation}
              onClose={() => togglePanel(false)}
            />
          </div>
        )}
      </section>
    </div>
  );
}
