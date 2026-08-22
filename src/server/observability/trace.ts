import { and, desc, eq, gte, lt, lte } from "drizzle-orm";
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
  | "queue.auto_giveup"
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

export type TraceQuery = {
  type?: string;
  since?: Date;
  until?: Date;
  /** `createdAt` (ISO) do último item já visto — paginação por keyset. */
  cursor?: string;
  limit?: number;
};

export type TraceLogEntry = TraceEventDto & {
  conversationId: string | null;
  contactName: string | null;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Visão organização-inteira do rastro técnico (todas as conversas, não só
 * uma) — usada pelo "Diagnóstico técnico" centralizado no painel admin
 * (`/api/internal/trace-log`), mais recente primeiro, com paginação.
 */
export async function queryTraceEvents(
  organizationId: string,
  q: TraceQuery
): Promise<{ entries: TraceLogEntry[]; nextCursor: string | null }> {
  const db = getDb();
  const limit = Math.min(q.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const rows = await db
    .select({
      event: schema.traceEvent,
      memberName: schema.user.name,
      contactName: schema.contact.name,
    })
    .from(schema.traceEvent)
    .leftJoin(schema.member, eq(schema.member.id, schema.traceEvent.memberId))
    .leftJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .leftJoin(schema.conversation, eq(schema.conversation.id, schema.traceEvent.conversationId))
    .leftJoin(schema.contact, eq(schema.contact.id, schema.conversation.contactId))
    .where(
      and(
        eq(schema.traceEvent.organizationId, organizationId),
        q.type ? eq(schema.traceEvent.type, q.type) : undefined,
        q.since ? gte(schema.traceEvent.createdAt, q.since) : undefined,
        q.until ? lte(schema.traceEvent.createdAt, q.until) : undefined,
        q.cursor ? lt(schema.traceEvent.createdAt, new Date(q.cursor)) : undefined
      )
    )
    .orderBy(desc(schema.traceEvent.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]!.event.createdAt.toISOString() : null;

  return {
    entries: page.map((r) => ({
      id: r.event.id,
      type: r.event.type,
      channel: r.event.channel,
      channelId: r.event.channelId,
      memberId: r.event.memberId,
      memberName: r.memberName ?? null,
      detail: r.event.detail as Record<string, unknown> | null,
      createdAt: r.event.createdAt.toISOString(),
      conversationId: r.event.conversationId,
      contactName: r.contactName ?? null,
    })),
    nextCursor,
  };
}
