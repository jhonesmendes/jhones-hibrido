/**
 * Hook de inicialização do Next. O trabalho real vive em instrumentation-node.ts
 * (import dinâmico condicionado ao runtime para que o bundler edge não
 * tente resolver dependências de Node como `postgres`).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { cleanupOrphanRuns } = await import("./instrumentation-node");
    await cleanupOrphanRuns();
    const { startFollowupScheduler } = await import(
      "@/server/pipeline/followup-scheduler"
    );
    startFollowupScheduler();
    const { startCampaignScheduler } = await import(
      "@/server/campaigns/scheduler"
    );
    startCampaignScheduler();
    const { startQueueScheduler } = await import("@/server/queue/scheduler");
    startQueueScheduler();
    const { startLicenseExpiryScheduler } = await import(
      "@/server/license/expiry-scheduler"
    );
    startLicenseExpiryScheduler();
    // Só a instância dedicada ao painel central envia o relatório — nas
    // instâncias de cliente normais `ADMIN_PANEL_HOST` nunca é configurado.
    if (process.env.ADMIN_PANEL_HOST) {
      const { scheduleLicenseReport } = await import("@/server/admin/report");
      scheduleLicenseReport();
    }
    const { reconnectAllOnBoot } = await import("@/server/baileys/manager");
    await reconnectAllOnBoot();
  }
}
