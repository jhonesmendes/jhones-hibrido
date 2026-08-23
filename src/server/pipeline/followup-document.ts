import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getFollowupRow } from "@/server/pipeline/followup";

/**
 * Reativo (não espera pelo scheduler, SC-004): é chamado a partir da ingestão
 * de mensagens recebidas quando chega mídia de um contato. Se "requer
 * documento" está habilitado NO DEPARTAMENTO DESSA CONVERSA e o lead desse
 * departamento está na etapa gatilho, move-o para a etapa de sucesso e
 * cancela qualquer lembrete ativo — um contato com lead em dois
 * departamentos só afeta o departamento de quem realmente mandou o
 * documento.
 */
export async function onInboundMedia(
  organizationId: string,
  contactId: string,
  departmentId: string | null
): Promise<void> {
  const config = await getFollowupRow(organizationId, departmentId);
  if (!config?.enabled || !config.requiresDocument) return;
  if (!config.triggerStageId || !config.successStageId) return;

  const db = getDb();
  const leads = await db
    .select()
    .from(schema.lead)
    .where(
      and(
        eq(schema.lead.contactId, contactId),
        departmentId ? eq(schema.lead.departmentId, departmentId) : isNull(schema.lead.departmentId)
      )
    )
    .limit(1);
  const lead = leads[0];
  if (!lead || lead.stageId !== config.triggerStageId) return;

  await db
    .update(schema.lead)
    .set({ stageId: config.successStageId, updatedAt: new Date() })
    .where(eq(schema.lead.id, lead.id));

  await db
    .update(schema.followupSend)
    .set({ status: "cancelled", resolvedAt: new Date() })
    .where(
      and(
        eq(schema.followupSend.leadId, lead.id),
        eq(schema.followupSend.status, "sent")
      )
    );
}
