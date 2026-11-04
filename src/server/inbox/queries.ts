import { and, desc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { isWindowOpen, windowRemainingMs } from "@/server/inbox/window";

export type ConversationDto = {
  id: string;
  contact: {
    id: string;
    name: string;
    waProfileName: string | null;
    phone: string;
    kind: "individual" | "group";
  };
  assignedTo: string | null;
  departmentId: string | null;
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
  awaitingFirstReply: boolean;
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
   * consolidada, só o owner tem essa opção no seletor). Com filtro ativo,
   * a checagem é ESTRITA por conversa individual — precisa ter
   * `department_id` igual ao filtro, sem passe-livre pra `null` (esse
   * passe-livre existiu antes e vazava conversas ainda sem departamento —
   * ex. fila pendente, canal não vinculado — pra QUALQUER departamento
   * selecionado; bug real, validado em produção com múltiplos
   * departamentos). Grupo é a única exceção: sem departamento, continua
   * visível a todos (é recurso compartilhado do time, ver a mesma regra
   * já aplicada em `assignedToFilter` acima). */
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
  // Um contato agora pode ter um lead por departamento (mesma separação
  // das conversas) — pega o lead DESTE departamento (o da própria
  // conversa), não um qualquer via LIMIT 1 sem filtro (isso mostrava a
  // etapa errada quando o contato tinha card em mais de um departamento).
  const stageSql = sql<string | null>`(
    select s.name from lead l
    join pipeline_stage s on s.id = l.stage_id
    where l.contact_id = ${schema.contact.id}
      and l.department_id is not distinct from ${schema.conversation.departmentId}
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
        // Estrito por conversa individual — só grupo sem departamento passa
        // livre (recurso compartilhado do time, mesma regra de cima). Uma
        // conversa individual com department_id null (fila pendente, canal
        // sem departamento vinculado) fica de fora de QUALQUER departamento
        // filtrado — só aparece na visão consolidada do owner (sem filtro)
        // ou, se for de fila, na tela Fila.
        departmentFilter
          ? or(
              eq(schema.conversation.departmentId, departmentFilter),
              and(
                eq(schema.contact.kind, "group"),
                isNull(schema.conversation.departmentId)
              )
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
 * IDs de conversa com pelo menos uma mensagem cujo texto contém `queryText`
 * — busca "dentro da conversa" pedida pelo usuário (a busca da caixa de
 * entrada, antes, só olhava nome/telefone/última mensagem — texto antigo
 * enterrado no histórico nunca aparecia). Mesmas regras de visibilidade de
 * `listConversations` (assignedToFilter/departmentFilter), pra não vazar
 * texto de conversa que o agente nem deveria ver na lista.
 */
export async function searchMessageConversationIds(
  organizationId: string,
  queryText: string,
  assignedToFilter?: string,
  departmentFilter?: string
): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ id: schema.conversation.id })
    .from(schema.message)
    .innerJoin(
      schema.conversation,
      eq(schema.message.conversationId, schema.conversation.id)
    )
    .innerJoin(
      schema.contact,
      eq(schema.conversation.contactId, schema.contact.id)
    )
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.isTest, false),
        ilike(schema.message.text, `%${queryText}%`),
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
        departmentFilter
          ? or(
              eq(schema.conversation.departmentId, departmentFilter),
              and(
                eq(schema.contact.kind, "group"),
                isNull(schema.conversation.departmentId)
              )
            )
          : undefined
      )
    )
    .limit(200);
  return rows.map((r) => r.id);
}

/**
 * A conversa mais recentemente ativa deste contato — um contato pode ter
 * uma por canal (ver `ConversationChannel` em ingest.ts); usado por quem
 * precisa de "a" conversa de um contato sem saber/escolher o canal (abrir
 * a partir de Contatos/Pipeline, encaminhar mensagem, follow-up).
 *
 * `departmentId`: quando informado, só considera conversas DESTE
 * departamento — sem isso, "chamar" um contato que já tem conversa em
 * outro departamento devolvia essa conversa alheia (bug real: nunca
 * aparecia na lista de quem chamou, porque a lista é filtrada estrito por
 * departamento ativo — ver `listConversations` — resultando em tela em
 * branco mesmo a chamada tendo funcionado). Sem o parâmetro, mantém o
 * comportamento antigo (mais recente em qualquer departamento) — usado
 * pela visão consolidada do owner e por quem já resolve o departamento
 * certo por fora (ex.: follow-up, que passa o do lead).
 */
export async function getMostRecentConversationForContact(
  organizationId: string,
  contactId: string,
  departmentId?: string | null
): Promise<typeof schema.conversation.$inferSelect | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.contactId, contactId),
        eq(schema.conversation.isTest, false),
        departmentId ? eq(schema.conversation.departmentId, departmentId) : undefined
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
      purgedAt: schema.messageMedia.purgedAt,
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
      waProfileName: contact.waProfileName,
      phone: contact.phone,
      kind: contact.kind,
    },
    assignedTo: c.assignedTo,
    departmentId: c.departmentId,
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
    // A empresa mandou algo por último e o cliente ainda não respondeu —
    // vale tanto pra quem nunca respondeu nada quanto pra quem já
    // respondeu antes mas não a esse round (conversa reaberta com modelo
    // novo). Diferente de "grupo": grupo nunca tem isso (sempre null).
    awaitingFirstReply: Boolean(
      c.lastOutboundAt && (!c.lastInboundAt || c.lastOutboundAt > c.lastInboundAt)
    ),
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
    /** Marca como não lida manualmente (ex.: "lembrar de responder depois")
     * — mesmo gesto do WhatsApp normal. `unreadCount` vira 1 mesmo sem
     * mensagem nova de verdade; qualquer lugar que só checa `> 0` (badge,
     * aba "Não lidas") já entende isso igual a uma mensagem não lida real. */
    markUnread?: boolean;
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
  if (patch.markUnread) set.unreadCount = 1;

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

/** Exclui a conversa (mensagens/fila/rastro cascateiam pelo schema). O
 * histórico de envio de campanha não cascateia de propósito — desvincula em
 * vez de bloquear, pra excluir uma conversa nunca travar por causa disso. */
export async function deleteConversation(
  organizationId: string,
  conversationId: string
): Promise<boolean> {
  const db = getDb();
  await db
    .update(schema.campaignRecipient)
    .set({ conversationId: null })
    .where(eq(schema.campaignRecipient.conversationId, conversationId));

  const deleted = await db
    .delete(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.id, conversationId)
      )
    )
    .returning({ id: schema.conversation.id });
  return deleted.length > 0;
}
