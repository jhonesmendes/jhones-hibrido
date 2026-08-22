import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/** Sem heartbeat por esse tempo com status "online" → marcado "away"
 * automaticamente. "busy"/"offline" nunca são tocados aqui — são estados
 * manuais explícitos (ver `touchPresence` em `status.ts`). */
export const AWAY_AFTER_MS = 5 * 60_000;

/** Roda uma vez o ciclo de detecção de ausência — separado do timer pra dar
 * pra testar/chamar isolado. */
export async function runPresenceAwaySweep(now: Date = new Date()): Promise<number> {
  const db = getDb();
  const threshold = new Date(now.getTime() - AWAY_AFTER_MS);

  const result = await db
    .update(schema.agentStatus)
    .set({ status: "away", updatedAt: now })
    .where(
      and(
        eq(schema.agentStatus.status, "online"),
        or(lt(schema.agentStatus.lastSeenAt, threshold), isNull(schema.agentStatus.lastSeenAt))
      )
    )
    .returning({ id: schema.agentStatus.id });

  return result.length;
}

const globalForPresence = globalThis as typeof globalThis & {
  __voceroPresenceTimer?: ReturnType<typeof setInterval>;
};

const SWEEP_INTERVAL_MS = 60_000;

/** Inicia o sweeper de ausência uma única vez por processo (mesmo padrão de
 * `startQueueScheduler`). Uma falha num ciclo não derruba os próximos. */
export function startPresenceAwaySweeper(): void {
  if (globalForPresence.__voceroPresenceTimer) return;
  globalForPresence.__voceroPresenceTimer = setInterval(() => {
    void runPresenceAwaySweep().catch((err) =>
      console.error("[presence] ciclo de ausência automática falhou:", err)
    );
  }, SWEEP_INTERVAL_MS);
}
