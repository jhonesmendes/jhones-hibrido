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
    const { reconnectAllOnBoot } = await import("@/server/baileys/manager");
    await reconnectAllOnBoot();
  }
}
