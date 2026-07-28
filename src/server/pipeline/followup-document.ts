import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getFollowupRow } from "@/server/pipeline/followup";

/**
 * Reativo (não espera pelo scheduler, SC-004): é chamado a partir da ingestão
 * de mensagens recebidas quando chega mídia de um contato. Se "requer
 * documento" está habilitado e o lead está na etapa gatilho, move-o para a
 * etapa de sucesso e cancela qualquer lembrete ativo.
 */
export async function onInboundMedia(
  organizationId: string,
  contactId: string
): Promise<void> {
  const config = await getFollowupRow(organizationId);
  if (!config?.enabled || !config.requiresDocument) return;
  if (!config.triggerStageId || !config.successStageId) return;

  const db = getDb();
  const leads = await db
    .select()
    .from(schema.lead)
    .where(eq(schema.lead.contactId, contactId))
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
