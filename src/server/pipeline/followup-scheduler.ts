import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { getEnv } from "@/lib/env";
import { sendText } from "@/server/inbox/send";
import {
  intervalToMs,
  isEligibleForExpiry,
  isEligibleForReminder,
  respondedAfterSend,
} from "@/server/pipeline/followup-eligibility";

/**
 * Ciclo de revisão do follow-up automático — roda no mesmo processo
 * (Constituição II), disparado por um `setInterval` a nível de módulo (ver
 * `startFollowupScheduler`). Percorre TODAS as organizações habilitadas;
 * uma falha pontual em um lead não interrompe o restante (FR-009).
 */
export async function runFollowupCycle(now: Date = new Date()): Promise<void> {
  const db = getDb();
  const configs = await db
    .select()
    .from(schema.pipelineFollowup)
    .where(eq(schema.pipelineFollowup.enabled, true));

  for (const config of configs) {
    if (!config.triggerStageId) continue;
    const intervalMs = intervalToMs(config.intervalValue, config.intervalUnit);

    const rows = await db
      .select({ lead: schema.lead, conversation: schema.conversation })
      .from(schema.lead)
      .innerJoin(
        schema.conversation,
        eq(schema.conversation.contactId, schema.lead.contactId)
      )
      .where(
        and(
          eq(schema.lead.organizationId, config.organizationId),
          eq(schema.lead.stageId, config.triggerStageId),
          eq(schema.conversation.isTest, false)
        )
      );

    for (const { lead, conversation } of rows) {
      const lastSendRows = await db
        .select()
        .from(schema.followupSend)
        .where(eq(schema.followupSend.leadId, lead.id))
        .orderBy(desc(schema.followupSend.sentAt))
        .limit(1);
      let lastSend = lastSendRows[0] ?? null;

      // O cliente respondeu depois do último lembrete ativo: é resolvido
      // (deixa de contar) antes de avaliar a elegibilidade.
      if (lastSend && respondedAfterSend(lead, lastSend)) {
        await db
          .update(schema.followupSend)
          .set({ status: "cancelled", resolvedAt: now })
          .where(eq(schema.followupSend.id, lastSend.id));
        lastSend = null;
      }

      if (
        config.message &&
        isEligibleForReminder(lead, lastSend, intervalMs, now)
      ) {
        try {
          await sendText({
            conversationId: conversation.id,
            organizationId: config.organizationId,
            text: config.message,
          });
          await db.insert(schema.followupSend).values({
            id: newId("followupSend"),
            organizationId: config.organizationId,
            leadId: lead.id,
            conversationId: conversation.id,
            message: config.message,
            status: "sent",
            sentAt: now,
          });
        } catch (err) {
          await db.insert(schema.followupSend).values({
            id: newId("followupSend"),
            organizationId: config.organizationId,
            leadId: lead.id,
            conversationId: conversation.id,
            message: config.message,
            status: "failed",
            sentAt: now,
          });
          console.error(
            `[followup] falha ao enviar lembrete para lead ${lead.id}:`,
            err
          );
        }
        continue;
      }

      if (
        config.expiredStageId &&
        isEligibleForExpiry(lastSend, intervalMs, now)
      ) {
        await db
          .update(schema.lead)
          .set({ stageId: config.expiredStageId, updatedAt: now })
          .where(eq(schema.lead.id, lead.id));
        await db
          .update(schema.followupSend)
          .set({ status: "expired", resolvedAt: now })
          .where(eq(schema.followupSend.id, lastSend!.id));
      }
    }
  }
}

const globalForFollowup = globalThis as unknown as {
  __voceroFollowupTimer?: ReturnType<typeof setInterval>;
};

/** Inicia o scheduler uma única vez por processo (o Next recarrega módulos em dev). */
export function startFollowupScheduler(): void {
  if (globalForFollowup.__voceroFollowupTimer) return;
  const intervalMs = getEnv().FOLLOWUP_SCHEDULER_INTERVAL_MS;
  globalForFollowup.__voceroFollowupTimer = setInterval(() => {
    void runFollowupCycle().catch((err) =>
      console.error("[followup] ciclo falhou:", err)
    );
  }, intervalMs);
}
