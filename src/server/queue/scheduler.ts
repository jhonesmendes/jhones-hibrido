import { and, eq, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { distributeConversation, getDepartmentQueueConfig } from "@/server/queue/manager";
import { handleSelectionAcceptTimeout, handleSelectionTimeout } from "@/server/queue/selection";
import { checkCriticalQueues } from "@/server/queue/critical-alert";

/**
 * Ciclo de revisão da fila — mesmo padrão de
 * `src/server/pipeline/followup-scheduler.ts` (setInterval a nível de
 * módulo, Constituição II: nada de fila externa). Quatro responsabilidades:
 * 1. `waiting` → tenta distribuir de novo (Modo A; algum agente pode ter
 *    ficado online desde a última tentativa).
 * 2. `selecting` vencido → cliente não respondeu à seleção a tempo
 *    (Modo B, Cenário 3).
 * 3. `assigned` vencido → agente não respondeu a tempo: Modo A aplica
 *    `accept_timeout_action`; Modo B reoferece as opções restantes
 *    (Cenário 2).
 * 4. Fila crítica (`waiting` >= `max_queue_size`) → avisa admin/owner
 *    (Sprint Q4, com cooldown — ver critical-alert.ts).
 * Uma falha pontual numa linha não interrompe o restante (mesmo padrão do
 * follow-up).
 */
export async function runQueueCycle(now: Date = new Date()): Promise<void> {
  const db = getDb();

  const waiting = await db
    .select({ id: schema.conversationQueue.id })
    .from(schema.conversationQueue)
    .where(eq(schema.conversationQueue.status, "waiting"));
  for (const row of waiting) {
    try {
      await distributeConversation(row.id);
    } catch (err) {
      console.error(`[queue] falha ao tentar distribuir ${row.id}:`, err);
    }
  }

  const selectingExpired = await db
    .select({ id: schema.conversationQueue.id })
    .from(schema.conversationQueue)
    .where(and(eq(schema.conversationQueue.status, "selecting"), lt(schema.conversationQueue.timeoutAt, now)));
  for (const row of selectingExpired) {
    try {
      await handleSelectionTimeout(row.id);
    } catch (err) {
      console.error(`[queue] falha ao tratar timeout de seleção ${row.id}:`, err);
    }
  }

  const expired = await db
    .select()
    .from(schema.conversationQueue)
    .where(and(eq(schema.conversationQueue.status, "assigned"), lt(schema.conversationQueue.timeoutAt, now)));
  for (const row of expired) {
    try {
      await handleAcceptTimeout(row, now);
    } catch (err) {
      console.error(`[queue] falha ao tratar timeout de aceite ${row.id}:`, err);
    }
  }

  await checkCriticalQueues(now).catch((err) =>
    console.error("[queue] falha ao checar filas críticas:", err)
  );
}

async function handleAcceptTimeout(
  row: typeof schema.conversationQueue.$inferSelect,
  now: Date
): Promise<void> {
  const db = getDb();
  const config = await getDepartmentQueueConfig(row.departmentId);
  if (!config) return;

  // Modo B: o agente escolhido pelo cliente não respondeu — reoferece as
  // opções restantes (Cenário 2), não o round-robin genérico do Modo A.
  if (config.routingMode === "client-selection") {
    await handleSelectionAcceptTimeout(row.id);
    return;
  }

  // Claim atômico: só processa se ainda estiver 'assigned' com o mesmo
  // agente (evita corrida com um aceite que chegou entre a leitura e aqui).
  const claimed = await db
    .update(schema.conversationQueue)
    .set({ status: "waiting", assignedTo: null, assignedAt: null, timeoutAt: null, attempt: row.attempt + 1, updatedAt: now })
    .where(
      and(
        eq(schema.conversationQueue.id, row.id),
        eq(schema.conversationQueue.status, "assigned"),
        eq(schema.conversationQueue.assignedTo, row.assignedTo ?? "")
      )
    )
    .returning();
  if (claimed.length === 0) return; // já foi aceita ou reprocessada por outro tick

  if (row.assignedTo) {
    await db
      .update(schema.agentStatus)
      .set({ currentConversations: sql`GREATEST(${schema.agentStatus.currentConversations} - 1, 0)`, updatedAt: now })
      .where(eq(schema.agentStatus.memberId, row.assignedTo));
  }

  // `queue`/`ai-assumes` (Q4): por ora só devolve pra fila em 'waiting' —
  // o próximo ciclo tenta distribuir de novo. `next-agent` faz a mesma
  // coisa MAS tenta imediatamente, sem esperar o próximo tick.
  if (config.acceptTimeoutAction === "next-agent") {
    await distributeConversation(row.id).catch((err) =>
      console.error(`[queue] falha ao tentar o próximo agente para ${row.id}:`, err)
    );
  }
}

const globalForQueue = globalThis as unknown as {
  __voceroQueueTimer?: ReturnType<typeof setInterval>;
};

const DEFAULT_INTERVAL_MS = 30_000;

/** Inicia o scheduler uma única vez por processo. */
export function startQueueScheduler(): void {
  if (globalForQueue.__voceroQueueTimer) return;
  globalForQueue.__voceroQueueTimer = setInterval(() => {
    void runQueueCycle().catch((err) => console.error("[queue] ciclo falhou:", err));
  }, DEFAULT_INTERVAL_MS);
}
