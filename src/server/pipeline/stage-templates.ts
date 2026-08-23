import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

/**
 * Clona o conjunto de etapas "compartilhado" (department_id null) da
 * organização pra um departamento — cada departamento passa a ter seu
 * próprio funil, preservando os nomes/posições que a organização já
 * customizou (não reseta pro template padrão de `on-signup.ts`).
 *
 * Idempotente: não faz nada se o departamento já tem QUALQUER etapa
 * própria — chamado tanto na criação do departamento (`createDepartment`)
 * quanto sob demanda pelo board (`/api/pipeline/board`) pra departamentos
 * que já existiam antes desta separação por departamento existir.
 */
export async function ensureDepartmentHasStages(
  organizationId: string,
  departmentId: string
): Promise<void> {
  const db = getDb();

  const own = await db
    .select({ id: schema.pipelineStage.id })
    .from(schema.pipelineStage)
    .where(
      and(
        scoped(schema.pipelineStage.organizationId, organizationId),
        eq(schema.pipelineStage.departmentId, departmentId)
      )
    )
    .limit(1);
  if (own.length > 0) return;

  const template = await db
    .select()
    .from(schema.pipelineStage)
    .where(
      and(
        scoped(schema.pipelineStage.organizationId, organizationId),
        isNull(schema.pipelineStage.departmentId)
      )
    )
    .orderBy(asc(schema.pipelineStage.position));
  if (template.length === 0) return;

  await db.insert(schema.pipelineStage).values(
    template.map((s) => ({
      id: newId("stage"),
      organizationId,
      departmentId,
      name: s.name,
      position: s.position,
      kind: s.kind,
    }))
  );
}
