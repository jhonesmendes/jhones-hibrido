import { EventEmitter } from "node:events";

/**
 * Bus de eventos in-process por organização (contrato sse.md).
 * Publicar SEMPRE depois do commit no BD. Uma instância = um processo,
 * então um EventEmitter é suficiente (sem filas externas — Constituição II).
 */

export type SseEvent =
  | { type: "message.new"; data: { conversationId: string; message: unknown } }
  | {
      type: "message.status";
      data: { conversationId: string; messageId: string; status: string };
    }
  | { type: "conversation.updated"; data: { conversation: unknown } }
  | {
      type: "lab.run";
      data: {
        runId: string;
        status: string;
        progress: { done: number; total: number };
        score?: number | null;
      };
    }
  | {
      type: "campaign.run";
      data: {
        campaignId: string;
        status: string;
        total: number;
        sent: number;
        failed: number;
      };
    }
  | {
      type: "channel.status";
      data: {
        /** v0.1: qual canal não oficial mudou de status (N por org). */
        channelId: string;
        status: "disconnected" | "connecting" | "connected";
        qrCode: string | null;
        phoneNumber: string | null;
      };
    }
  | {
      type: "queue.assigned";
      /** Dirigido a UM membro (Sprint Q2) — `/api/events` filtra por
       * `targetMemberId` antes de repassar ao navegador; nenhum outro
       * membro vê este evento (ver server/events/bus.ts::subscribe). */
      data: {
        targetMemberId: string;
        queueId: string;
        conversationId: string;
        contactId: string;
        departmentId: string;
        contactName: string;
        timeoutAt: string | null;
      };
    };

const globalForBus = globalThis as unknown as { __voceroBus?: EventEmitter };

function getBus(): EventEmitter {
  if (!globalForBus.__voceroBus) {
    const bus = new EventEmitter();
    bus.setMaxListeners(200);
    globalForBus.__voceroBus = bus;
  }
  return globalForBus.__voceroBus;
}

export function publish(organizationId: string, event: SseEvent): void {
  getBus().emit(`org:${organizationId}`, event);
}

export function subscribe(
  organizationId: string,
  listener: (event: SseEvent) => void
): () => void {
  const bus = getBus();
  const channel = `org:${organizationId}`;
  bus.on(channel, listener);
  return () => bus.off(channel, listener);
}
