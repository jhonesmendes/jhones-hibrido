import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

type Db = ReturnType<typeof getDb>;

/** Primeira etapa aberta (kind="open") pro departamento — preferindo uma
 * etapa PRÓPRIA do departamento; sem nenhuma (departamento criado antes
 * desta separação existir, ou canal ainda sem departamento) cai na etapa
 * compartilhada (department_id null) — o board também tenta clonar as
 * etapas sob demanda (ver `/api/pipeline/board`), então esse fallback é só
 * pra essa corrida específica. */
async function findFirstOpenStage(
  db: Db,
  organizationId: string,
  departmentId: string | null
): Promise<{ id: string; departmentId: string | null } | null> {
  const stageDeptCondition = departmentId
    ? sql`(${schema.pipelineStage.departmentId} = ${departmentId} OR ${schema.pipelineStage.departmentId} IS NULL)`
    : isNull(schema.pipelineStage.departmentId);

  const rows = await db
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
  return rows[0] ?? null;
}

async function nextPositionInStage(db: Db, organizationId: string, stageId: string): Promise<number> {
  const maxPos = await db
    .select({ max: sql<number>`coalesce(max(${schema.lead.position}), -1)` })
    .from(schema.lead)
    .where(and(eq(schema.lead.organizationId, organizationId), eq(schema.lead.stageId, stageId)));
  return (maxPos[0]?.max ?? -1) + 1;
}

/**
 * Atividade de lead — mensagem recebida OU modelo disparado pelo agente
 * (US2, evoluído): se o contato não tem lead NESTE departamento, ele é
 * criado na primeira etapa aberta do pipeline DESSE departamento. Se já
 * tem, sua última atividade é atualizada — e, se a etapa atual é "perdido"
 * (kind=lost — ex.: expirou sem resposta), o card VOLTA pra primeira etapa
 * aberta automaticamente: qualquer atividade nova (cliente respondeu, ou o
 * agente reabriu mandando um modelo) sinaliza que o card precisa de
 * atenção de novo, não devia continuar parado num board "encerrado".
 *
 * "Ganho" (kind=won) NUNCA reabre sozinho — bug real: o Follow-up move o
 * lead pra uma etapa "won" ao receber o comprovante (ver
 * followup-document.ts) e cancela o lembrete; uma mensagem trivial do
 * contato DEPOIS disso (ex.: "obrigado!") reabria o card de volta pra
 * etapa-gatilho do Follow-up, reiniciando a cobrança de um comprovante que
 * já tinha sido entregue. "Ganho" passa a significar conclusão de verdade
 * — reabrir um card assim é decisão manual no board, não automática.
 *
 * Um contato que fala com dois departamentos (duas conversas) tem um card
 * em cada — mesma separação já aplicada às conversas.
 */
export async function onLeadActivity(
  organizationId: string,
  contactId: string,
  departmentId: string | null,
  at: Date
): Promise<void> {
  const db = getDb();

  const existing = await db
    .select({ id: schema.lead.id, stageId: schema.lead.stageId, kind: schema.pipelineStage.kind })
    .from(schema.lead)
    .innerJoin(schema.pipelineStage, eq(schema.lead.stageId, schema.pipelineStage.id))
    .where(
      scoped(
        schema.lead.organizationId,
        organizationId,
        eq(schema.lead.contactId, contactId),
        departmentId ? eq(schema.lead.departmentId, departmentId) : isNull(schema.lead.departmentId)
      )
    )
    .limit(1);

  if (existing[0]) {
    const lead = existing[0];
    if (lead.kind === "lost") {
      const firstStage = await findFirstOpenStage(db, organizationId, departmentId);
      // Só reabre se a etapa alvo for diferente da atual (evita mexer em
      // posição à toa se por algum motivo a única etapa aberta for a que
      // já está — não deveria acontecer, "Finalizado" é âncora, mas não
      // custa ser defensivo).
      if (firstStage && firstStage.id !== lead.stageId) {
        const position = await nextPositionInStage(db, organizationId, firstStage.id);
        await db
          .update(schema.lead)
          .set({ stageId: firstStage.id, position, lastActivityAt: at, updatedAt: new Date() })
          .where(eq(schema.lead.id, lead.id));
        return;
      }
    }
    await db
      .update(schema.lead)
      .set({ lastActivityAt: at, updatedAt: new Date() })
      .where(eq(schema.lead.id, lead.id));
    return;
  }

  const firstStage = await findFirstOpenStage(db, organizationId, departmentId);
  if (!firstStage) return; // pipeline sem etapas abertas: não há onde criar

  const effectiveDepartmentId = firstStage.departmentId ? departmentId : null;
  const position = await nextPositionInStage(db, organizationId, firstStage.id);

  await db
    .insert(schema.lead)
    .values({
      id: newId("lead"),
      organizationId,
      contactId,
      departmentId: effectiveDepartmentId,
      stageId: firstStage.id,
      position,
      lastActivityAt: at,
    })
    .onConflictDoNothing({ target: [schema.lead.contactId, schema.lead.departmentId] });
}
