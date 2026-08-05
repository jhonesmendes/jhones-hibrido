import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { notifyAgentAssigned } from "@/server/queue/notifier";
import { isWithinBusinessHours } from "@/server/queue/business-hours";
import { sendText } from "@/server/inbox/send";
import { logTrace } from "@/server/observability/trace";
import { publish } from "@/server/events/bus";

const DEFAULT_OFFLINE_MESSAGE =
  "No momento estamos fora do horário de atendimento. Deixe sua mensagem e retornaremos assim que possível.";

type DepartmentQueueConfig = {
  id: string;
  queueEnabled: boolean;
  routingMode: string;
  distributionMode: string | null;
  acceptTimeoutSeconds: number | null;
  acceptTimeoutAction: string | null;
  maxConversationsPerAgent: number | null;
  noAgentsMessage: string | null;
  selectionGreeting: string | null;
  selectionFormat: string | null;
  selectionShowOnlyOnline: boolean | null;
  selectionTimeoutSeconds: number | null;
  selectionTimeoutAction: string | null;
  selectionUnavailableMessage: string | null;
  offlineMessage: string | null;
  queueMessage: string | null;
  businessHours: unknown;
  timezone: string;
};

/** Config de fila do departamento, ou `null` se não existir. */
export async function getDepartmentQueueConfig(
  departmentId: string
): Promise<DepartmentQueueConfig | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.department.id,
      queueEnabled: schema.department.queueEnabled,
      routingMode: schema.department.routingMode,
      distributionMode: schema.department.distributionMode,
      acceptTimeoutSeconds: schema.department.acceptTimeoutSeconds,
      acceptTimeoutAction: schema.department.acceptTimeoutAction,
      maxConversationsPerAgent: schema.department.maxConversationsPerAgent,
      noAgentsMessage: schema.department.noAgentsMessage,
      selectionGreeting: schema.department.selectionGreeting,
      selectionFormat: schema.department.selectionFormat,
      selectionShowOnlyOnline: schema.department.selectionShowOnlyOnline,
      selectionTimeoutSeconds: schema.department.selectionTimeoutSeconds,
      selectionTimeoutAction: schema.department.selectionTimeoutAction,
      selectionUnavailableMessage: schema.department.selectionUnavailableMessage,
      offlineMessage: schema.department.offlineMessage,
      queueMessage: schema.department.queueMessage,
      businessHours: schema.department.businessHours,
      timezone: schema.department.timezone,
    })
    .from(schema.department)
    .where(eq(schema.department.id, departmentId))
    .limit(1);
  return rows[0] ?? null;
}

type EligibleAgent = {
  memberId: string;
  currentConversations: number;
  lastAssignedAt: Date | null;
};

async function eligibleAgents(departmentId: string, cap: number): Promise<EligibleAgent[]> {
  const db = getDb();
  const rows = await db
    .select({
      memberId: schema.memberDepartment.memberId,
      status: schema.agentStatus.status,
      currentConversations: schema.agentStatus.currentConversations,
      lastAssignedAt: schema.agentStatus.lastAssignedAt,
    })
    .from(schema.memberDepartment)
    .innerJoin(
      schema.agentStatus,
      eq(schema.agentStatus.memberId, schema.memberDepartment.memberId)
    )
    .where(eq(schema.memberDepartment.departmentId, departmentId));
  return rows
    .filter((r) => r.status === "online" && r.currentConversations < cap)
    .map((r) => ({
      memberId: r.memberId,
      currentConversations: r.currentConversations,
      lastAssignedAt: r.lastAssignedAt,
    }));
}

export type DepartmentAgent = {
  memberId: string;
  name: string;
  status: string;
  currentConversations: number;
};

/** Membros do departamento com nome e presença — usado pelo Modo B
 * (`selection.ts`) pra montar a lista de opções mostrada ao cliente. Sem
 * `agent_status` ainda (nunca setou status): entra como 'offline'. */
export async function listDepartmentAgents(departmentId: string): Promise<DepartmentAgent[]> {
  const db = getDb();
  const rows = await db
    .select({
      memberId: schema.memberDepartment.memberId,
      name: schema.user.name,
      status: schema.agentStatus.status,
      currentConversations: schema.agentStatus.currentConversations,
    })
    .from(schema.memberDepartment)
    .innerJoin(schema.member, eq(schema.member.id, schema.memberDepartment.memberId))
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .leftJoin(schema.agentStatus, eq(schema.agentStatus.memberId, schema.memberDepartment.memberId))
    .where(eq(schema.memberDepartment.departmentId, departmentId));
  return rows.map((r) => ({
    memberId: r.memberId,
    name: r.name,
    status: r.status ?? "offline",
    currentConversations: r.currentConversations ?? 0,
  }));
}

/**
 * `first-available`: qualquer um serve, pega o primeiro da lista.
 * `round-robin` (default): quem faz mais tempo sem receber nada primeiro —
 * `lastAssignedAt` nulo (nunca recebeu) vem antes de qualquer data.
 * `least-busy`: quem tem menos conversas em andamento agora (empate
 * resolvido por round-robin).
 * `manual`: nunca auto-designa — a conversa fica em 'waiting' até um
 * agente do depto se auto-atribuir (`POST /api/queue/[id]/claim`).
 */
function pickAgent(agents: EligibleAgent[], distributionMode: string | null): EligibleAgent | null {
  if (agents.length === 0 || distributionMode === "manual") return null;
  if (distributionMode === "first-available") return agents[0] ?? null;
  if (distributionMode === "least-busy") {
    const sorted = [...agents].sort((a, b) => {
      if (a.currentConversations !== b.currentConversations) {
        return a.currentConversations - b.currentConversations;
      }
      const at = a.lastAssignedAt ? a.lastAssignedAt.getTime() : -1;
      const bt = b.lastAssignedAt ? b.lastAssignedAt.getTime() : -1;
      return at - bt;
    });
    return sorted[0] ?? null;
  }
  const sorted = [...agents].sort((a, b) => {
    const at = a.lastAssignedAt ? a.lastAssignedAt.getTime() : -1;
    const bt = b.lastAssignedAt ? b.lastAssignedAt.getTime() : -1;
    return at - bt;
  });
  return sorted[0] ?? null;
}

/**
 * Cria a entrada na fila do departamento se ainda não houver uma ativa —
 * chamado pelo ingest.ts quando o canal está vinculado a um depto com
 * `queue_enabled`. Idempotente: se já existe uma linha ativa
 * (waiting/selecting/assigned/accepted) para esta conversa, devolve `null`
 * (nada a fazer). Sandbox do Laboratório NUNCA entra aqui (guardrail no
 * chamador, ver ingest.ts).
 *
 * NÃO decide Modo A vs. Modo B — isso é responsabilidade de quem chama
 * (ingest.ts), pra manager.ts não precisar importar selection.ts (que já
 * importa manager.ts; evita dependência circular).
 */
const ACTIVE_QUEUE_STATUSES = ["waiting", "selecting", "assigned", "accepted"];

/** Linha de fila em andamento pra esta conversa (qualquer status ativo),
 * ou `null`. Usado pelo ingest.ts pra saber se uma mensagem nova do
 * cliente é resposta a uma seleção em aberto (Modo B) em vez de "conversa
 * nova entrando na fila". */
export async function findActiveQueueEntry(
  conversationId: string,
  departmentId: string
): Promise<{ id: string; status: string } | null> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.conversationQueue.id, status: schema.conversationQueue.status })
    .from(schema.conversationQueue)
    .where(
      and(
        eq(schema.conversationQueue.conversationId, conversationId),
        eq(schema.conversationQueue.departmentId, departmentId)
      )
    )
    .limit(1);
  const active = rows.find((r) => ACTIVE_QUEUE_STATUSES.includes(r.status));
  return active ?? null;
}

export async function routeConversationToQueue(
  conversationId: string,
  departmentId: string
): Promise<{ queueId: string; withinBusinessHours: boolean } | null> {
  const config = await getDepartmentQueueConfig(departmentId);
  if (!config || !config.queueEnabled) return null;

  const active = await findActiveQueueEntry(conversationId, departmentId);
  if (active) return null; // já está na fila (ou já foi roteada) — nada a fazer

  const db = getDb();
  const [queueEntry] = await db
    .insert(schema.conversationQueue)
    .values({
      id: newId("conversationQueue"),
      conversationId,
      departmentId,
      status: "waiting",
    })
    .returning();
  if (!queueEntry) return null;

  // Cenário 6: fora do horário de funcionamento — avisa o cliente UMA vez
  // (aqui, na criação) e deixa a linha em 'waiting'. distributeConversation
  // e sendSelectionGreeting também checam antes de agir, então nada tenta
  // rotear até o expediente abrir; o scheduler já tenta 'waiting' de novo
  // a cada ciclo, então basta o horário abrir pra seguir sozinho — sem
  // precisar de um estado dedicado de "aguardando expediente".
  const withinBusinessHours = isWithinBusinessHours(config.businessHours, config.timezone);
  const row = await loadQueueRow(queueEntry.id);
  if (row) {
    await logTrace({
      organizationId: row.conversation.organizationId,
      conversationId,
      type: "queue.entered",
      detail: { departmentId, withinBusinessHours, routingMode: config.routingMode },
    });
  }
  if (!withinBusinessHours && row) {
    await sendText({
      conversationId: row.conversation.id,
      organizationId: row.conversation.organizationId,
      text: config.offlineMessage || DEFAULT_OFFLINE_MESSAGE,
    }).catch((err) => console.error(`[queue] falha ao avisar fora do horário (${queueEntry.id}):`, err));
  }

  return { queueId: queueEntry.id, withinBusinessHours };
}

type QueueJoinRow = {
  queue: typeof schema.conversationQueue.$inferSelect;
  conversation: typeof schema.conversation.$inferSelect;
  contact: typeof schema.contact.$inferSelect;
};

/** Carrega a linha da fila com a conversa e o contato — usado tanto pelo
 * Modo A (`distributeConversation`) quanto pelo Modo B (`selection.ts`). */
export async function loadQueueRow(queueId: string): Promise<QueueJoinRow | null> {
  const db = getDb();
  const rows = await db
    .select({ queue: schema.conversationQueue, conversation: schema.conversation, contact: schema.contact })
    .from(schema.conversationQueue)
    .innerJoin(schema.conversation, eq(schema.conversation.id, schema.conversationQueue.conversationId))
    .innerJoin(schema.contact, eq(schema.contact.id, schema.conversation.contactId))
    .where(eq(schema.conversationQueue.id, queueId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Designa a conversa a UM agente específico já escolhido — claim atômico
 * contra corrida (mesmo padrão de
 * `src/server/auth/password-reset.ts::consumePasswordReset`). Compartilhado
 * por `distributeConversation` (Modo A, agente escolhido pelo sistema) e
 * `selection.ts::assignChosenAgent` (Modo B, agente escolhido pelo cliente).
 * `fromStatus` é o status exigido na linha pra o claim valer — 'waiting'
 * no Modo A, 'selecting' no Modo B.
 */
export async function assignConversationToAgent(
  row: QueueJoinRow,
  memberId: string,
  acceptTimeoutSeconds: number,
  fromStatus: string,
  /** `false` quando o próprio agente é quem escolheu pegar (claim manual) —
   * o toast "Nova conversa / Aceitar" não faz sentido pra quem já tomou a
   * decisão sozinho. */
  notify = true
): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const timeoutAt = new Date(now.getTime() + acceptTimeoutSeconds * 1000);

  const claimed = await db
    .update(schema.conversationQueue)
    .set({ status: "assigned", assignedTo: memberId, assignedAt: now, timeoutAt, updatedAt: now })
    .where(and(eq(schema.conversationQueue.id, row.queue.id), eq(schema.conversationQueue.status, fromStatus)))
    .returning();
  if (claimed.length === 0) return false;

  await db
    .update(schema.agentStatus)
    .set({
      currentConversations: sql`${schema.agentStatus.currentConversations} + 1`,
      lastAssignedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.agentStatus.memberId, memberId));

  if (notify) {
    await notifyAgentAssigned(row.conversation.organizationId, {
      targetMemberId: memberId,
      queueId: row.queue.id,
      conversationId: row.conversation.id,
      contactId: row.contact.id,
      departmentId: row.queue.departmentId,
      contactName: row.contact.name,
      timeoutAt,
    });
  }

  await logTrace({
    organizationId: row.conversation.organizationId,
    conversationId: row.conversation.id,
    type: "queue.assigned",
    memberId,
    detail: {
      mode: fromStatus === "selecting" ? "client-selection" : "automatic",
      departmentId: row.queue.departmentId,
    },
  });

  return true;
}

/**
 * Tenta designar a conversa em espera a um agente online do departamento
 * (Modo A). Retorna `{ assigned: false }` sem nenhum agente elegível — a
 * conversa permanece em `waiting` até alguém ficar online (o scheduler,
 * Sprint Q2 item 9, também tenta de novo a cada timeout de aceite).
 */
export async function distributeConversation(
  queueId: string
): Promise<{ assigned: boolean; memberId?: string }> {
  const row = await loadQueueRow(queueId);
  if (!row || row.queue.status !== "waiting") return { assigned: false };

  const config = await getDepartmentQueueConfig(row.queue.departmentId);
  if (!config || !config.queueEnabled) return { assigned: false };

  // Cenário 6: fora do horário, não distribui — fica em 'waiting' até o
  // próximo ciclo do scheduler cair dentro do expediente de novo.
  if (!isWithinBusinessHours(config.businessHours, config.timezone)) return { assigned: false };

  const cap = config.maxConversationsPerAgent ?? 5;
  const agents = await eligibleAgents(row.queue.departmentId, cap);
  const agent = pickAgent(agents, config.distributionMode);
  if (!agent) return { assigned: false };

  const ok = await assignConversationToAgent(
    row,
    agent.memberId,
    config.acceptTimeoutSeconds ?? 120,
    "waiting"
  );
  return ok ? { assigned: true, memberId: agent.memberId } : { assigned: false };
}

/**
 * Auto-atribuição: um agente do departamento pega uma conversa `waiting`
 * direto da tela de Fila, sem esperar o sistema escolher (também é o
 * retorno seguro em modo automático quando o toast em tempo real passa
 * batido ou expira — ver GET /api/queue). Diferente da distribuição
 * automática, aqui não faz sentido um segundo passo de "aceitar": quem
 * clicou "Pegar" já decidiu, então isso já confirma o aceite na hora
 * (`acceptQueuedConversation`) em vez de deixar em `assigned` esperando
 * outra confirmação — é isso que fazia a conversa demorar a aparecer na
 * Caixa de Entrada depois do clique.
 */
export async function claimQueuedConversation(
  queueId: string,
  memberId: string
): Promise<{ ok: boolean; conversationId?: string }> {
  const row = await loadQueueRow(queueId);
  if (!row || row.queue.status !== "waiting") return { ok: false };

  const config = await getDepartmentQueueConfig(row.queue.departmentId);
  if (!config || !config.queueEnabled) return { ok: false };

  const db = getDb();
  const [membership] = await db
    .select({ memberId: schema.memberDepartment.memberId })
    .from(schema.memberDepartment)
    .where(
      and(
        eq(schema.memberDepartment.departmentId, row.queue.departmentId),
        eq(schema.memberDepartment.memberId, memberId)
      )
    )
    .limit(1);
  if (!membership) return { ok: false };

  const assigned = await assignConversationToAgent(
    row,
    memberId,
    config.acceptTimeoutSeconds ?? 120,
    "waiting",
    false
  );
  if (!assigned) return { ok: false };

  return acceptQueuedConversation(queueId, memberId);
}

/**
 * Confirma o aceite (agente respondeu/clicou "Aceitar" antes do timeout):
 * grava `conversation.department_id` + `assigned_to` juntos — só AGORA a
 * conversa entra na visão normal da Caixa de Entrada do departamento (ver
 * ROADMAP_queue_routing.md § "Decisão de visibilidade"). Claim atômico
 * igual ao de `distributeConversation`.
 */
export async function acceptQueuedConversation(
  queueId: string,
  memberId: string
): Promise<{ ok: boolean; conversationId?: string }> {
  const db = getDb();
  const now = new Date();
  const claimed = await db
    .update(schema.conversationQueue)
    .set({ status: "accepted", acceptedAt: now, updatedAt: now })
    .where(
      and(
        eq(schema.conversationQueue.id, queueId),
        eq(schema.conversationQueue.status, "assigned"),
        eq(schema.conversationQueue.assignedTo, memberId)
      )
    )
    .returning();
  const row = claimed[0];
  if (!row) return { ok: false };

  await db
    .update(schema.conversation)
    .set({ departmentId: row.departmentId, assignedTo: memberId, updatedAt: now })
    .where(eq(schema.conversation.id, row.conversationId));

  const conv = await db
    .select({ organizationId: schema.conversation.organizationId })
    .from(schema.conversation)
    .where(eq(schema.conversation.id, row.conversationId))
    .limit(1);
  if (conv[0]) {
    // Sem isso, a Caixa de Entrada só pega a conversa recém-aceita no
    // próximo refetch periódico — o painel escuta esse evento (SSE) pra
    // atualizar a lista na hora (é o que o agente sente como "demora"
    // entre aceitar/pegar e a conversa aparecer).
    publish(conv[0].organizationId, {
      type: "conversation.updated",
      data: { conversation: { id: row.conversationId } },
    });
    await logTrace({
      organizationId: conv[0].organizationId,
      conversationId: row.conversationId,
      type: "queue.accepted",
      memberId,
      detail: { departmentId: row.departmentId },
    });
  }

  return { ok: true, conversationId: row.conversationId };
}

/**
 * "Repassar" (botão ao lado de "Aceitar"): o agente designado recusa —
 * volta pra `waiting` e tenta redistribuir imediatamente. `round-robin`
 * naturalmente despriorza quem acabou de recusar (o `lastAssignedAt` já
 * foi tocado na designação original).
 */
export async function declineQueuedConversation(
  queueId: string,
  memberId: string
): Promise<{ ok: boolean }> {
  const db = getDb();
  const now = new Date();
  const claimed = await db
    .update(schema.conversationQueue)
    .set({ status: "waiting", assignedTo: null, assignedAt: null, timeoutAt: null, attempt: sql`${schema.conversationQueue.attempt} + 1`, updatedAt: now })
    .where(
      and(
        eq(schema.conversationQueue.id, queueId),
        eq(schema.conversationQueue.status, "assigned"),
        eq(schema.conversationQueue.assignedTo, memberId)
      )
    )
    .returning();
  const row = claimed[0];
  if (!row) return { ok: false };

  await db
    .update(schema.agentStatus)
    .set({
      currentConversations: sql`GREATEST(${schema.agentStatus.currentConversations} - 1, 0)`,
      updatedAt: now,
    })
    .where(eq(schema.agentStatus.memberId, memberId));

  const conv = await db
    .select({ organizationId: schema.conversation.organizationId })
    .from(schema.conversation)
    .where(eq(schema.conversation.id, row.conversationId))
    .limit(1);
  if (conv[0]) {
    await logTrace({
      organizationId: conv[0].organizationId,
      conversationId: row.conversationId,
      type: "queue.declined",
      memberId,
      detail: { departmentId: row.departmentId },
    });
  }

  await distributeConversation(queueId).catch((err) =>
    console.error(`[queue] falha ao redistribuir após repasse de ${queueId}:`, err)
  );

  return { ok: true };
}

export type QueueEntryDto = {
  id: string;
  conversationId: string;
  departmentId: string;
  status: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  assignedTo: string | null;
  assignedToName: string | null;
  timeoutAt: string | null;
  attempt: number;
  createdAt: string;
};

/** Tela de fila (admin/owner do depto) — entradas ainda em andamento
 * (não inclui `abandoned`/`expired`/`accepted`, já resolvidas). */
export async function listDepartmentQueue(departmentIds: string[]): Promise<QueueEntryDto[]> {
  if (departmentIds.length === 0) return [];
  const db = getDb();
  const agent = schema.member;
  const rows = await db
    .select({
      queue: schema.conversationQueue,
      contact: schema.contact,
      assignedName: schema.user.name,
    })
    .from(schema.conversationQueue)
    .innerJoin(schema.conversation, eq(schema.conversation.id, schema.conversationQueue.conversationId))
    .innerJoin(schema.contact, eq(schema.contact.id, schema.conversation.contactId))
    .leftJoin(agent, eq(agent.id, schema.conversationQueue.assignedTo))
    .leftJoin(schema.user, eq(schema.user.id, agent.userId))
    .where(inArray(schema.conversationQueue.departmentId, departmentIds));

  return rows
    .filter((r) => ["waiting", "selecting", "assigned"].includes(r.queue.status))
    .map((r) => ({
      id: r.queue.id,
      conversationId: r.queue.conversationId,
      departmentId: r.queue.departmentId,
      status: r.queue.status,
      contactId: r.contact.id,
      contactName: r.contact.name,
      contactPhone: r.contact.phone,
      assignedTo: r.queue.assignedTo,
      assignedToName: r.assignedName,
      timeoutAt: r.queue.timeoutAt ? r.queue.timeoutAt.toISOString() : null,
      attempt: r.queue.attempt,
      createdAt: r.queue.createdAt.toISOString(),
    }));
}
