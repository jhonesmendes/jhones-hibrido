import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

/**
 * Atividade de lead ao receber uma mensagem (US2): se o contato não tem lead
 * NESTE departamento, ele é criado na primeira etapa do pipeline DESSE
 * departamento; se já tem, sua última atividade é atualizada. Um contato que
 * fala com dois departamentos (duas conversas) tem um card em cada — mesma
 * separação já aplicada às conversas.
 */
export async function onLeadActivity(
  organizationId: string,
  contactId: string,
  departmentId: string | null,
  at: Date
): Promise<void> {
  const db = getDb();

  const existing = await db
    .select({ id: schema.lead.id })
    .from(schema.lead)
    .where(
      and(
        eq(schema.lead.contactId, contactId),
        departmentId ? eq(schema.lead.departmentId, departmentId) : isNull(schema.lead.departmentId)
      )
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(schema.lead)
      .set({ lastActivityAt: at, updatedAt: new Date() })
      .where(eq(schema.lead.id, existing[0].id));
    return;
  }

  // Etapa inicial: preferindo uma etapa aberta do PRÓPRIO departamento; sem
  // nenhuma (departamento criado antes desta separação existir, ou canal
  // ainda sem departamento) cai na etapa compartilhada (department_id null)
  // — o board também tenta clonar as etapas sob demanda (ver `/api/pipeline
  // /board`), então esse fallback é só pra essa corrida específica.
  const stageDeptCondition = departmentId
    ? sql`(${schema.pipelineStage.departmentId} = ${departmentId} OR ${schema.pipelineStage.departmentId} IS NULL)`
    : isNull(schema.pipelineStage.departmentId);

  const firstStage = await db
    .select({ id: schema.pipelineStage.id, departmentId: schema.pipelineStage.departmentId })
    .from(schema.pipelineStage)
    .where(
      and(
        eq(schema.pipelineStage.organizationId, organizationId),
        eq(schema.pipelineStage.kind, "open"),
        stageDeptCondition
      )
    )
    // Etapa do próprio departamento primeiro (NULLS LAST não existe em ASC
    // direto pra isso — ordena por "é null" ANTES da posição, então uma
    // etapa própria sempre vence a compartilhada quando ambas existem).
    .orderBy(
      sql`(${schema.pipelineStage.departmentId} is null) asc`,
      asc(schema.pipelineStage.position)
    )
    .limit(1);
  if (!firstStage[0]) return; // pipeline sem etapas abertas: não há onde criar

  const effectiveDepartmentId = firstStage[0].departmentId ? departmentId : null;

  const maxPos = await db
    .select({ max: sql<number>`coalesce(max(${schema.lead.position}), -1)` })
    .from(schema.lead)
    .where(
      and(
        eq(schema.lead.organizationId, organizationId),
        eq(schema.lead.stageId, firstStage[0].id)
      )
    );

  await db
    .insert(schema.lead)
    .values({
      id: newId("lead"),
      organizationId,
      contactId,
      departmentId: effectiveDepartmentId,
      stageId: firstStage[0].id,
      position: (maxPos[0]?.max ?? -1) + 1,
      lastActivityAt: at,
    })
    .onConflictDoNothing({ target: [schema.lead.contactId, schema.lead.departmentId] });
}
