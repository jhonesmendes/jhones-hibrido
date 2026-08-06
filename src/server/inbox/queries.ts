import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { isWindowOpen, windowRemainingMs } from "@/server/inbox/window";

export type ConversationDto = {
  id: string;
  contact: { id: string; name: string; phone: string; kind: "individual" | "group" };
  assignedTo: string | null;
  stageName: string | null;
  /** Canal activo: official (Cloud API) o unofficial (gateway). */
  channel: "official" | "unofficial";
  aiEnabled: boolean;
  handoffAt: string | null;
  handoffReason: string | null;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  windowOpen: boolean;
  windowRemainingMs: number;
  preview: string | null;
};

export async function listConversations(
  organizationId: string,
  since?: Date,
  /** Sem `conversations:view_all`: restringe às conversas atribuídas ao
   * próprio membro (FR-007) — pertencer ao departamento do número NÃO
   * basta sozinho (revertido depois de testar em produção: o checkbox
   * "ver todas as conversas" precisa valer também dentro do depto). */
  assignedToFilter?: string,
  /** Departamento ativo (v0.1); undefined/null = sem filtro (visão
   * consolidada). Conversas sem department_id ficam de fora quando um
   * departamento está ativo — só entram quando o canal que as originou
   * estiver vinculado a um departamento (Configurações → Canais). */
  departmentFilter?: string
): Promise<ConversationDto[]> {
  const db = getDb();
  const previewSql = sql<string | null>`(
    select coalesce(m.text, m.type)
    from message m
    where m.conversation_id = ${schema.conversation.id}
    order by m.created_at desc
    limit 1
  )`;
  const stageSql = sql<string | null>`(
    select s.name from lead l
    join pipeline_stage s on s.id = l.stage_id
    where l.contact_id = ${schema.contact.id}
    limit 1
  )`;

  const rows = await db
    .select({
      conversation: schema.conversation,
      contact: schema.contact,
      preview: previewSql,
      stageName: stageSql,
    })
    .from(schema.conversation)
    .innerJoin(
      schema.contact,
      eq(schema.conversation.contactId, schema.contact.id)
    )
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.isTest, false),
        since ? gt(schema.conversation.updatedAt, since) : undefined,
        // Grupo nunca tem "um" dono (assigned_to sempre fica vazio — ver
        // ingest.ts), então a regra de "só o que é meu" nunca bateria pra
        // ele. Em vez disso: visível pra qualquer membro do departamento
        // dono do grupo (ou de todos, se o grupo ainda não tem
        // departamento) — não precisa da permissão de ver TUDO da org só
        // pra ver os grupos do próprio time, igual ao WhatsApp Web normal.
        assignedToFilter
          ? or(
              eq(schema.conversation.assignedTo, assignedToFilter),
              and(
                eq(schema.contact.kind, "group"),
                or(
                  isNull(schema.conversation.departmentId),
                  sql`exists (
                    select 1 from member_department md
                    where md.member_id = ${assignedToFilter}
                      and md.department_id = ${schema.conversation.departmentId}
                  )`
                )
              )
            )
          : undefined,
        // Sem departmentId (conversa ainda não roteada a nenhum departamento)
        // fica visível a todos — mesmo com um filtro ativo (ver comentário
        // do campo em schema.ts). Só exclui conversas de OUTRO departamento.
        departmentFilter
          ? or(
              eq(schema.conversation.departmentId, departmentFilter),
              isNull(schema.conversation.departmentId)
            )
          : undefined
      )
    )
    .orderBy(desc(sql`coalesce(${schema.conversation.lastMessageAt}, ${schema.conversation.createdAt})`));

  return rows.map((r) =>
    serializeConversation(r.conversation, r.contact, r.preview, r.stageName)
  );
}

/**
 * A conversa mais recentemente ativa deste contato — um contato pode ter
 * uma por canal (ver `ConversationChannel` em ingest.ts); usado por quem
 * precisa de "a" conversa de um contato sem saber/escolher o canal (abrir
 * a partir de Contatos/Pipeline, encaminhar mensagem, follow-up).
 */
export async function getMostRecentConversationForContact(
  organizationId: string,
  contactId: string
): Promise<typeof schema.conversation.$inferSelect | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.contactId, contactId),
        eq(schema.conversation.isTest, false)
      )
    )
    .orderBy(desc(sql`coalesce(${schema.conversation.lastMessageAt}, ${schema.conversation.createdAt})`))
    .limit(1);
  return rows[0] ?? null;
}

export async function getConversation(
  organizationId: string,
  conversationId: string
) {
  const db = getDb();
  const rows = await db
    .select({ conversation: schema.conversation, contact: schema.contact })
    .from(schema.conversation)
    .innerJoin(
      schema.contact,
      eq(schema.conversation.contactId, schema.contact.id)
    )
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.id, conversationId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listMessages(
  organizationId: string,
  conversationId: string,
  since?: Date
) {
  const db = getDb();
  return db
    .select({
      message: schema.message,
      filename: schema.messageMedia.filename,
      sizeBytes: schema.messageMedia.sizeBytes,
      mimeType: schema.messageMedia.mimeType,
      // Assinatura no painel interno (quem mandou) — nunca vai pro
      // WhatsApp, só existe pra quem está visualizando a conversa aqui.
      senderName: schema.user.name,
    })
    .from(schema.message)
    .leftJoin(
      schema.messageMedia,
      eq(schema.messageMedia.messageId, schema.message.id)
    )
    .leftJoin(schema.member, eq(schema.member.id, schema.message.sentByMemberId))
    .leftJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(
      scoped(
        schema.message.organizationId,
        organizationId,
        eq(schema.message.conversationId, conversationId),
        since ? gt(schema.message.createdAt, since) : undefined
      )
    )
    .orderBy(schema.message.createdAt);
}

/** Nome de quem mandou (assinatura no painel) — usado pelo `send.ts` pra
 * incluir no evento SSE ao vivo (`message.new`), senão só quem reabrisse a
 * conversa depois veria a assinatura; outros acompanhando ao vivo, não. */
export async function getMemberName(memberId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ name: schema.user.name })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(eq(schema.member.id, memberId))
    .limit(1);
  return rows[0]?.name ?? null;
}

export function serializeConversation(
  c: typeof schema.conversation.$inferSelect,
  contact: typeof schema.contact.$inferSelect,
  preview: string | null = null,
  stageName: string | null = null
): ConversationDto {
  // El canal no oficial no tiene ventana de 24h: siempre "abierta".
  const unofficial = c.channel === "unofficial";
  return {
    id: c.id,
    contact: {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      kind: contact.kind,
    },
    assignedTo: c.assignedTo,
    stageName,
    channel: c.channel,
    aiEnabled: c.aiEnabled,
    handoffAt: c.handoffAt?.toISOString() ?? null,
    handoffReason: c.handoffReason,
    lastInboundAt: c.lastInboundAt?.toISOString() ?? null,
    lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    unreadCount: c.unreadCount,
    windowOpen: unofficial || isWindowOpen(c.lastInboundAt),
    windowRemainingMs: unofficial
      ? Number.MAX_SAFE_INTEGER
      : windowRemainingMs(c.lastInboundAt),
    preview,
  };
}

export async function updateConversation(
  organizationId: string,
  conversationId: string,
  patch: {
    aiEnabled?: boolean;
    reactivate?: boolean;
    markRead?: boolean;
    channel?: "official" | "unofficial";
    assignedTo?: string | null;
  }
) {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.aiEnabled !== undefined) set.aiEnabled = patch.aiEnabled;
  if (patch.channel !== undefined) set.channel = patch.channel;
  if (patch.assignedTo !== undefined) set.assignedTo = patch.assignedTo;
  if (patch.reactivate) {
    set.handoffAt = null;
    set.handoffReason = null;
    set.aiEnabled = patch.aiEnabled ?? true;
  }
  if (patch.markRead) set.unreadCount = 0;

  const updated = await db
    .update(schema.conversation)
    .set(set)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.id, conversationId)
      )
    )
    .returning();
  return updated[0] ?? null;
}
