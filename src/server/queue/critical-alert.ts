import { and, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { sendPushToMember } from "@/server/push/send";

/**
 * Fila crítica (Sprint Q4, roadmap item 17): quando `waiting` de um depto
 * atinge `max_queue_size`, avisa admins do depto + owners da org — uma
 * vez, com um intervalo mínimo entre avisos (evita spam a cada ciclo do
 * scheduler enquanto a fila continuar cheia). O cooldown é em memória de
 * processo: reinicia o container, reinicia a contagem — aceitável pra um
 * alerta operacional best-effort (Constituição II: sem fila/estado externo).
 */
const COOLDOWN_MS = 10 * 60 * 1000;
const lastNotifiedAt = new Map<string, number>();

export async function checkCriticalQueues(now: Date = new Date()): Promise<void> {
  const db = getDb();
  const departments = await db
    .select({
      id: schema.department.id,
      organizationId: schema.department.organizationId,
      name: schema.department.name,
      maxQueueSize: schema.department.maxQueueSize,
    })
    .from(schema.department)
    .where(eq(schema.department.queueEnabled, true));

  for (const dept of departments) {
    try {
      await checkOneDepartment(dept, now);
    } catch (err) {
      console.error(`[queue] falha ao checar fila crítica do depto ${dept.id}:`, err);
    }
  }
}

async function checkOneDepartment(
  dept: { id: string; organizationId: string; name: string; maxQueueSize: number | null },
  now: Date
): Promise<void> {
  const maxSize = dept.maxQueueSize ?? 50;
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(schema.conversationQueue)
    .where(and(eq(schema.conversationQueue.departmentId, dept.id), eq(schema.conversationQueue.status, "waiting")));
  const waitingCount = row?.n ?? 0;
  if (waitingCount < maxSize) return;

  const last = lastNotifiedAt.get(dept.id) ?? 0;
  if (now.getTime() - last < COOLDOWN_MS) return;
  lastNotifiedAt.set(dept.id, now.getTime());

  const admins = await db
    .select({ memberId: schema.memberDepartment.memberId })
    .from(schema.memberDepartment)
    .where(and(eq(schema.memberDepartment.departmentId, dept.id), eq(schema.memberDepartment.role, "admin")));
  const owners = await db
    .select({ memberId: schema.member.id })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, dept.organizationId),
        eq(schema.member.role, "owner"),
        eq(schema.member.isActive, true)
      )
    );

  const targets = new Set([...admins.map((a) => a.memberId), ...owners.map((o) => o.memberId)]);
  for (const memberId of targets) {
    await sendPushToMember(memberId, {
      title: "Fila de atendimento cheia",
      body: `${dept.name}: ${waitingCount} conversas aguardando atendimento`,
      url: "/queue",
      conversationId: `queue-critical-${dept.id}`,
    }).catch((err) => console.error(`[queue] falha ao notificar fila crítica pro membro ${memberId}:`, err));
  }
}
