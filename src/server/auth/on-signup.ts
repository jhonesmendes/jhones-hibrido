import { count, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

/** Etapas iniciais (seed) do pipeline (US2). */
const SEED_STAGES: { name: string; kind: "open" | "won" | "lost" }[] = [
  { name: "Novo", kind: "open" },
  { name: "Em conversa", kind: "open" },
  { name: "Interessado", kind: "open" },
  { name: "Cliente", kind: "won" },
  { name: "Perdido", kind: "lost" },
];

/**
 * Primeiro registro da instância: cria a organização, deixa o usuário como
 * proprietário e semeia (seed) o pipeline + perfil do agente.
 *
 * Só age se NÃO existir nenhuma organização (as contas de equipe são criadas
 * pelo proprietário e recebem sua membership explícita). Um advisory lock
 * evita que dois registros simultâneos em instância vazia criem duas
 * organizações.
 */
export async function onUserCreated(userId: string, userName: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    // Lock transacional de "primeiro arranque" (chave arbitrária fixa):
    // dois registros simultâneos em instância vazia → só um cria a org.
    await tx.execute(sql`select pg_advisory_xact_lock(874201)`);
    const [orgs] = await tx
      .select({ n: count() })
      .from(schema.organization);
    if ((orgs?.n ?? 0) > 0) return;

    const orgId = newId("organization");
    await tx.insert(schema.organization).values({
      id: orgId,
      name: userName ? `Negócio de ${userName}` : "Meu negócio",
      slug: "principal",
    });
    await tx.insert(schema.member).values({
      id: newId("organization"),
      organizationId: orgId,
      userId,
      role: "owner",
    });
    await tx.insert(schema.pipelineStage).values(
      SEED_STAGES.map((s, i) => ({
        id: newId("stage"),
        organizationId: orgId,
        name: s.name,
        position: i,
        kind: s.kind,
      }))
    );
    await tx.insert(schema.agentProfile).values({
      id: newId("agentProfile"),
      organizationId: orgId,
    });
  });
}

/** Organização ativa de um usuário (sua primeira membership). */
export async function resolveActiveOrganizationId(
  userId: string
): Promise<string | null> {
  return (await resolveMembership(userId))?.organizationId ?? null;
}

export async function resolveMembership(userId: string): Promise<{
  memberId: string;
  organizationId: string;
  role: string;
  isActive: boolean;
  activeDepartmentId: string | null;
} | null> {
  const db = getDb();
  const rows = await db
    .select({
      memberId: schema.member.id,
      organizationId: schema.member.organizationId,
      role: schema.member.role,
      isActive: schema.member.isActive,
      activeDepartmentId: schema.member.activeDepartmentId,
    })
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}
