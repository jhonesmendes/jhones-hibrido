import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

export type AgentStatusValue = "offline" | "online" | "busy" | "away";

const VALID_STATUSES: ReadonlySet<AgentStatusValue> = new Set([
  "offline",
  "online",
  "busy",
  "away",
]);

export function isAgentStatusValue(value: string): value is AgentStatusValue {
  return VALID_STATUSES.has(value as AgentStatusValue);
}

/** Sem linha ainda (membro nunca setou status) = offline. */
export async function getMemberStatus(memberId: string): Promise<AgentStatusValue> {
  const db = getDb();
  const rows = await db
    .select({ status: schema.agentStatus.status })
    .from(schema.agentStatus)
    .where(eq(schema.agentStatus.memberId, memberId))
    .limit(1);
  const status = rows[0]?.status;
  return status && isAgentStatusValue(status) ? status : "offline";
}

/** Upsert: cria a linha na primeira mudança de status do membro. */
export async function setMemberStatus(
  memberId: string,
  status: AgentStatusValue
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .insert(schema.agentStatus)
    .values({
      id: newId("agentStatus"),
      memberId,
      status,
      lastSeenAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.agentStatus.memberId,
      set: { status, lastSeenAt: now, updatedAt: now },
    });
}

/**
 * Sinal de atividade real (heartbeat do navegador, ver `presence-heartbeat
 * .tsx`) — NUNCA sobrescreve um status manual explícito: "busy" e "offline"
 * continuam do jeito que o agente deixou mesmo com atividade (ele escolheu
 * não ser perturbado / se desconectar de propósito); só tira de "away" de
 * volta pra "online" (retomou o uso depois de ficar ausente) — e, sem
 * nenhuma linha ainda (primeiro login, nunca setou nada), assume "online"
 * por padrão. Sempre atualiza `lastSeenAt`, que é o que o sweeper usa pra
 * decidir quando marcar como ausente por inatividade (ver `sweeper.ts`).
 */
export async function touchPresence(memberId: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .select({ status: schema.agentStatus.status })
    .from(schema.agentStatus)
    .where(eq(schema.agentStatus.memberId, memberId))
    .limit(1);
  const existing = rows[0]?.status;
  const current: AgentStatusValue | null =
    existing && isAgentStatusValue(existing) ? existing : null;
  const nextStatus: AgentStatusValue =
    current === null || current === "away" ? "online" : current;

  await db
    .insert(schema.agentStatus)
    .values({
      id: newId("agentStatus"),
      memberId,
      status: nextStatus,
      lastSeenAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.agentStatus.memberId,
      set: { status: nextStatus, lastSeenAt: now, updatedAt: now },
    });
}
