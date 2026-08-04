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
