"use client";

import { useEffect, useRef } from "react";

export type EventHandlers = {
  onMessageNew?: (data: { conversationId: string; message: unknown }) => void;
  onMessageStatus?: (data: {
    conversationId: string;
    messageId: string;
    status: string;
  }) => void;
  onConversationUpdated?: (data: { conversation: unknown }) => void;
  onLabRun?: (data: {
    runId: string;
    status: string;
    progress: { done: number; total: number };
    score?: number | null;
  }) => void;
  onCampaignRun?: (data: {
    campaignId: string;
    status: string;
    total: number;
    sent: number;
    failed: number;
  }) => void;
  onChannelStatus?: (data: {
    status: "disconnected" | "connecting" | "connected";
    qrCode: string | null;
    phoneNumber: string | null;
  }) => void;
  /** É chamado após RECONECTAR (não na conexão inicial): catch-up com refetch. */
  onReconnect?: () => void;
};

/**
 * Assinatura SSE da caixa de entrada (contrato sse.md). O EventSource
 * reconecta sozinho; o servidor não garante replay, então ao reconectar o
 * consumidor deve refazer o fetch com `since=` (onReconnect).
 */
export function useEvents(handlers: EventHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const source = new EventSource("/api/events");
    let hadError = false;

    const listen = <T,>(type: string, handler: (data: T) => void) => {
      source.addEventListener(type, (ev) => {
        try {
          handler(JSON.parse((ev as MessageEvent).data) as T);
        } catch {
          // evento malformado: ignorar
        }
      });
    };

    listen("message.new", (d) => handlersRef.current.onMessageNew?.(d as never));
    listen("message.status", (d) =>
      handlersRef.current.onMessageStatus?.(d as never)
    );
    listen("conversation.updated", (d) =>
      handlersRef.current.onConversationUpdated?.(d as never)
    );
    listen("lab.run", (d) => handlersRef.current.onLabRun?.(d as never));
    listen("channel.status", (d) =>
      handlersRef.current.onChannelStatus?.(d as never)
    );
    listen("campaign.run", (d) =>
      handlersRef.current.onCampaignRun?.(d as never)
    );

    source.onerror = () => {
      hadError = true;
    };
    source.onopen = () => {
      if (hadError) {
        hadError = false;
        handlersRef.current.onReconnect?.();
      }
    };

    return () => source.close();
  }, []);
}
