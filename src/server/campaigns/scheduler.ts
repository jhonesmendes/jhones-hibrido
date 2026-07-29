import { and, eq, isNotNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { startCampaign } from "@/server/campaigns/send";

/**
 * Ciclo do agendamento de campanhas — mesmo padrão do follow-up de pipeline
 * (`setInterval` a nível de módulo, sem fila externa — Constituição II).
 * Dispara campanhas "draft" cujo `scheduledAt` já chegou; uma falha pontual
 * numa campanha não impede as demais.
 */
export async function runCampaignScheduleCycle(now: Date = new Date()): Promise<void> {
  const db = getDb();
  const due = await db
    .select({ id: schema.campaign.id, organizationId: schema.campaign.organizationId })
    .from(schema.campaign)
    .where(
      and(
        eq(schema.campaign.status, "draft"),
        isNotNull(schema.campaign.scheduledAt),
        lte(schema.campaign.scheduledAt, now)
      )
    );

  for (const campaign of due) {
    try {
      await startCampaign(campaign.organizationId, campaign.id);
    } catch (err) {
      console.error(
        `[campaign-scheduler] falha ao disparar campanha ${campaign.id}:`,
        err
      );
    }
  }
}

const globalForCampaignScheduler = globalThis as unknown as {
  __voceroCampaignSchedulerTimer?: ReturnType<typeof setInterval>;
};

/** Inicia o scheduler uma única vez por processo (o Next recarrega módulos em dev). */
export function startCampaignScheduler(): void {
  if (globalForCampaignScheduler.__voceroCampaignSchedulerTimer) return;
  const intervalMs = getEnv().CAMPAIGN_SCHEDULER_INTERVAL_MS;
  globalForCampaignScheduler.__voceroCampaignSchedulerTimer = setInterval(() => {
    void runCampaignScheduleCycle().catch((err) =>
      console.error("[campaign-scheduler] ciclo falhou:", err)
    );
  }, intervalMs);
}
