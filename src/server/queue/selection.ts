import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { renderMessage } from "@/lib/campaigns/render";
import { sendText } from "@/server/inbox/send";
import { isWithinBusinessHours } from "@/server/queue/business-hours";
import {
  assignConversationToAgent,
  distributeConversation,
  getDepartmentQueueConfig,
  listDepartmentAgents,
  loadQueueRow,
} from "@/server/queue/manager";

/**
 * Modo B — seleção pelo cliente (Sprint Q3). Mensagens são texto puro
 * (`renderMessage`, `{{nome}}` etc.) — NUNCA passam pelo LLM: o menu
 * precisa funcionar mesmo sem `OPENROUTER_API_TOKEN` configurado
 * (Princípio II, ver ROADMAP_queue_routing.md gap #4).
 *
 * Simplificações desta sprint (documentadas, não são bugs):
 * - Resposta do cliente que não bate com nenhuma opção é ignorada (sem
 *   loop de "não entendi, tente de novo") — evita reprompt infinito sem
 *   uma heurística melhor; timeout eventualmente resolve.
 * - "Sem agentes disponíveis" (Cenário 4) devolve a conversa pra fila
 *   'waiting' com um aviso ao cliente, em vez do diálogo sim/não completo
 *   do roadmap original — o scheduler já tenta de novo quando alguém
 *   ficar online, igual ao Modo A.
 * - Cenário 7 (agente offline na lista, Sprint Q4): quando
 *   `selection_show_only_online=false`, a lista inclui offline com
 *   indicador "(offline)". Se o cliente escolher um deles, a designação
 *   segue normal (o agente offline não vai responder) — o timeout de
 *   aceite (Cenário 2, `handleSelectionAcceptTimeout`) já reoferece as
 *   opções restantes sozinho, sem precisar de um diálogo extra de
 *   "aguardar ou escolher outro".
 */

export type SelectionOption = { label: string; memberId: string; name: string; online: boolean };

const DEFAULT_GREETING = "Olá {{nome}}! Com qual atendente você deseja falar?";
const DEFAULT_NO_AGENTS_MESSAGE =
  "No momento todos os atendentes estão ocupados. Vamos te atender assim que possível.";
const DEFAULT_UNAVAILABLE_MESSAGE =
  "{{agente}} não está disponível no momento. Deseja falar com outro atendente?";

function buildOptions(
  agents: { memberId: string; name: string; online: boolean }[],
  format: string | null
): SelectionOption[] {
  return agents.map((a, i) => ({
    label: format === "letters" ? String.fromCharCode(65 + i) : String(i + 1),
    memberId: a.memberId,
    name: a.name,
    online: a.online,
  }));
}

function formatOptionsList(options: SelectionOption[]): string {
  return options.map((o) => `${o.label}. ${o.name}${o.online ? "" : " (offline)"}`).join("\n");
}

/**
 * `selectionShowOnlyOnline` (default true): só online, sujeitos ao teto de
 * conversas simultâneas. `false` (Cenário 7): inclui offline também — sem
 * teto pra eles (não têm conversa em andamento pra estourar limite).
 */
async function eligibleForSelection(
  departmentId: string,
  cap: number,
  onlyOnline: boolean,
  exclude: Set<string> = new Set()
): Promise<{ memberId: string; name: string; online: boolean }[]> {
  const agents = await listDepartmentAgents(departmentId);
  return agents
    .filter((a) => !exclude.has(a.memberId))
    .filter((a) =>
      a.status === "online" ? a.currentConversations < cap : !onlyOnline
    )
    .map((a) => ({ memberId: a.memberId, name: a.name, online: a.status === "online" }));
}

/** Cenário 4: ninguém disponível — devolve pra fila normal (mesmo
 * mecanismo de espera do Modo A) e avisa o cliente uma vez. */
async function fallbackToWaiting(
  queueId: string,
  organizationId: string,
  conversationId: string,
  message: string
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.conversationQueue)
    .set({ status: "waiting", selectionSentAt: null, timeoutAt: null, updatedAt: new Date() })
    .where(eq(schema.conversationQueue.id, queueId));
  await sendText({ conversationId, organizationId, text: message }).catch((err) =>
    console.error(`[queue] falha ao avisar cliente sem agentes disponíveis (${queueId}):`, err)
  );
}

/** Cenário 1: envia a saudação + lista de agentes e entra em 'selecting'. */
export async function sendSelectionGreeting(queueId: string): Promise<void> {
  const row = await loadQueueRow(queueId);
  if (!row || row.queue.status !== "waiting") return;

  const config = await getDepartmentQueueConfig(row.queue.departmentId);
  if (!config || !config.queueEnabled || config.routingMode !== "client-selection") return;

  // Cenário 6: fora do horário, não manda o menu ainda — a mensagem de
  // "fora do horário" já foi enviada na criação da fila
  // (routeConversationToQueue); aqui só evita perguntar "com quem falar"
  // fora do expediente.
  if (!isWithinBusinessHours(config.businessHours, config.timezone)) return;

  const cap = config.maxConversationsPerAgent ?? 5;
  const onlyOnline = config.selectionShowOnlyOnline ?? true;
  const agents = await eligibleForSelection(row.queue.departmentId, cap, onlyOnline);

  if (agents.length === 0) {
    await fallbackToWaiting(
      queueId,
      row.conversation.organizationId,
      row.conversation.id,
      config.noAgentsMessage || DEFAULT_NO_AGENTS_MESSAGE
    );
    return;
  }

  const options = buildOptions(agents, config.selectionFormat);
  const greeting = renderMessage(config.selectionGreeting || DEFAULT_GREETING, {
    nome: row.contact.name,
  });
  const text = `${greeting}\n\n${formatOptionsList(options)}`;

  const now = new Date();
  const timeoutSeconds = config.selectionTimeoutSeconds ?? 105;
  const db = getDb();
  const claimed = await db
    .update(schema.conversationQueue)
    .set({
      status: "selecting",
      selectionSentAt: now,
      timeoutAt: new Date(now.getTime() + timeoutSeconds * 1000),
      selectionOptions: options,
      updatedAt: now,
    })
    .where(and(eq(schema.conversationQueue.id, queueId), eq(schema.conversationQueue.status, "waiting")))
    .returning();
  if (claimed.length === 0) return; // corrida: outro processo já avançou essa linha

  await sendText({ conversationId: row.conversation.id, organizationId: row.conversation.organizationId, text }).catch(
    (err) => console.error(`[queue] falha ao enviar saudação de seleção (${queueId}):`, err)
  );
}

/** Interpreta a resposta do cliente a uma seleção em aberto — chamado pelo
 * ingest.ts quando a conversa está em 'selecting'. Resposta que não bate
 * com nenhuma opção é ignorada (ver simplificações no topo do arquivo). */
export async function handleSelectionReply(queueId: string, replyText: string): Promise<void> {
  const row = await loadQueueRow(queueId);
  if (!row || row.queue.status !== "selecting") return;

  const options = (row.queue.selectionOptions as SelectionOption[] | null) ?? [];
  if (options.length === 0) return;

  const normalized = replyText.trim().toLowerCase();
  const choice = options.find(
    (o) => o.label.toLowerCase() === normalized || o.name.toLowerCase() === normalized
  );
  if (!choice) return;

  const config = await getDepartmentQueueConfig(row.queue.departmentId);
  if (!config) return;

  const db = getDb();
  await db
    .update(schema.conversationQueue)
    .set({ clientChoice: replyText, updatedAt: new Date() })
    .where(eq(schema.conversationQueue.id, queueId));

  await assignConversationToAgent(row, choice.memberId, config.acceptTimeoutSeconds ?? 120, "selecting");
}

/** Cenário 3: cliente não respondeu à saudação a tempo. */
export async function handleSelectionTimeout(queueId: string): Promise<void> {
  const row = await loadQueueRow(queueId);
  if (!row || row.queue.status !== "selecting") return;

  const config = await getDepartmentQueueConfig(row.queue.departmentId);
  if (!config) return;

  const db = getDb();
  const claimed = await db
    .update(schema.conversationQueue)
    .set({ status: "waiting", selectionSentAt: null, timeoutAt: null, updatedAt: new Date() })
    .where(and(eq(schema.conversationQueue.id, queueId), eq(schema.conversationQueue.status, "selecting")))
    .returning();
  if (claimed.length === 0) return;

  // 'auto-assign' tenta na hora (Modo A a partir daqui); 'queue'/'ai-assumes'
  // ficam em 'waiting' pro próximo ciclo do scheduler tentar de novo —
  // mesma simplificação do accept_timeout_action no Modo A (Sprint Q2).
  if (config.selectionTimeoutAction === "auto-assign") {
    await distributeConversation(queueId).catch((err) =>
      console.error(`[queue] falha ao auto-designar após timeout de seleção (${queueId}):`, err)
    );
  }
}

/** Cenário 2: agente escolhido pelo cliente não respondeu a tempo — reoferece
 * as opções restantes (ou cai no Cenário 4 se não sobrar ninguém). */
export async function handleSelectionAcceptTimeout(queueId: string): Promise<void> {
  const row = await loadQueueRow(queueId);
  if (!row || row.queue.status !== "assigned" || !row.queue.assignedTo) return;

  const config = await getDepartmentQueueConfig(row.queue.departmentId);
  if (!config) return;

  const declinedMemberId = row.queue.assignedTo;
  const declinedName =
    ((row.queue.selectionOptions as SelectionOption[] | null) ?? []).find(
      (o) => o.memberId === declinedMemberId
    )?.name ?? "";

  const db = getDb();
  const claimed = await db
    .update(schema.conversationQueue)
    .set({ status: "selecting", assignedTo: null, assignedAt: null, timeoutAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(schema.conversationQueue.id, queueId),
        eq(schema.conversationQueue.status, "assigned"),
        eq(schema.conversationQueue.assignedTo, declinedMemberId)
      )
    )
    .returning();
  if (claimed.length === 0) return;

  await db
    .update(schema.agentStatus)
    .set({ currentConversations: sql`GREATEST(${schema.agentStatus.currentConversations} - 1, 0)`, updatedAt: new Date() })
    .where(eq(schema.agentStatus.memberId, declinedMemberId));

  const cap = config.maxConversationsPerAgent ?? 5;
  const onlyOnline = config.selectionShowOnlyOnline ?? true;
  const remaining = await eligibleForSelection(
    row.queue.departmentId,
    cap,
    onlyOnline,
    new Set([declinedMemberId])
  );

  if (remaining.length === 0) {
    await fallbackToWaiting(
      queueId,
      row.conversation.organizationId,
      row.conversation.id,
      config.noAgentsMessage || DEFAULT_NO_AGENTS_MESSAGE
    );
    return;
  }

  const options = buildOptions(remaining, config.selectionFormat);
  const unavailable = renderMessage(config.selectionUnavailableMessage || DEFAULT_UNAVAILABLE_MESSAGE, {
    agente: declinedName,
  });
  const text = `${unavailable}\n\n${formatOptionsList(options)}`;

  const now = new Date();
  const timeoutSeconds = config.selectionTimeoutSeconds ?? 105;
  await db
    .update(schema.conversationQueue)
    .set({
      selectionSentAt: now,
      timeoutAt: new Date(now.getTime() + timeoutSeconds * 1000),
      selectionOptions: options,
      attempt: row.queue.attempt + 1,
      updatedAt: now,
    })
    .where(eq(schema.conversationQueue.id, queueId));

  await sendText({ conversationId: row.conversation.id, organizationId: row.conversation.organizationId, text }).catch(
    (err) => console.error(`[queue] falha ao reoferecer opções (${queueId}):`, err)
  );
}
