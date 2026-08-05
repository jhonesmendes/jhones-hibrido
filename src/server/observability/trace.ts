import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

/**
 * Todo evento que compõe o rastro de uma conversa — do recebimento da
 * mensagem do cliente até a resposta sair (ou o motivo de não ter saído).
 */
export type TraceEventType =
  | "message.received"
  | "conversation.started_by_agent"
  | "conversation.routed_inbox"
  | "conversation.routed_queue"
  | "queue.entered"
  | "queue.assigned"
  | "queue.accepted"
  | "queue.declined"
  | "queue.selection_timeout"
  | "queue.accept_timeout"
  | "message.sent"
  | "message.send_failed"
  | "conversation.transferred";

/**
 * Grava um evento do rastro (nunca lança — um problema aqui não pode
 * derrubar o envio/recebimento real que está sendo registrado, mesmo
 * princípio de `logAudit`).
 */
export async function logTrace(params: {
  organizationId: string;
  conversationId?: string | null;
  type: TraceEventType;
  channel?: "official" | "unofficial" | null;
  channelId?: string | null;
  memberId?: string | null;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const db = getDb();
    await db.insert(schema.traceEvent).values({
      id: newId("traceEvent"),
      organizationId: params.organizationId,
      conversationId: params.conversationId ?? null,
      type: params.type,
      channel: params.channel ?? null,
      channelId: params.channelId ?? null,
      memberId: params.memberId ?? null,
      detail: params.detail ?? null,
    });
  } catch (err) {
    console.error("[trace] falha ao registrar evento:", err);
  }
}

export type TraceEventDto = {
  id: string;
  type: string;
  channel: string | null;
  channelId: string | null;
  memberId: string | null;
  memberName: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

/** Linha do tempo de uma conversa, mais antigo primeiro — pra ler como uma
 * história ("chegou → foi pra fila → designado pra Fulano → respondeu"). */
export async function getConversationTrace(
  organizationId: string,
  conversationId: string
): Promise<TraceEventDto[]> {
  const db = getDb();
  const rows = await db
    .select({
      event: schema.traceEvent,
      memberName: schema.user.name,
    })
    .from(schema.traceEvent)
    .leftJoin(schema.member, eq(schema.member.id, schema.traceEvent.memberId))
    .leftJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(
      and(
        eq(schema.traceEvent.organizationId, organizationId),
        eq(schema.traceEvent.conversationId, conversationId)
      )
    )
    .orderBy(desc(schema.traceEvent.createdAt));

  return rows
    .map((r) => ({
      id: r.event.id,
      type: r.event.type,
      channel: r.event.channel,
      channelId: r.event.channelId,
      memberId: r.event.memberId,
      memberName: r.memberName ?? null,
      detail: r.event.detail as Record<string, unknown> | null,
      createdAt: r.event.createdAt.toISOString(),
    }))
    .reverse();
}
