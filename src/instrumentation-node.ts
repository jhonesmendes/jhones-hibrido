import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Limpeza na inicialização (FR-034): execuções do Laboratório que ficaram
 * "running" após um reinício → falhas. Roda apenas no runtime Node.
 */
export async function cleanupOrphanRuns(): Promise<void> {
  try {
    const db = getDb();
    const updated = await db
      .update(schema.agentTestRun)
      .set({
        status: "failed",
        error: "Interrompida por um reinício do servidor",
        finishedAt: new Date(),
      })
      .where(eq(schema.agentTestRun.status, "running"))
      .returning({ id: schema.agentTestRun.id });
    if (updated.length > 0) {
      console.log(
        `[boot] ${updated.length} execução(ões) órfã(s) do Laboratório marcada(s) como falha(s)`
      );
    }
  } catch (err) {
    // O BD pode ainda não estar pronto (migrações rodam antes do servidor).
    console.error("[boot] limpeza de execuções órfãs falhou:", err);
  }
}
