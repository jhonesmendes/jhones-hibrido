import { desc } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { isAiConfigured } from "@/lib/env";
import { RunConflictError, startRun } from "@/server/lab/runner";

export const dynamic = "force-dynamic";

/** Histórico de execuções com delta de score em relação à anterior (FR-033). */
export const GET = withAuth(async (session) => {
  const db = getDb();
  const runs = await db
    .select()
    .from(schema.agentTestRun)
    .where(scoped(schema.agentTestRun.organizationId, session.organizationId))
    .orderBy(desc(schema.agentTestRun.startedAt))
    .limit(50);

  const withDelta = runs.map((run, i) => {
    const prev = runs
      .slice(i + 1)
      .find((r) => r.status === "done" && r.score !== null);
    return {
      id: run.id,
      status: run.status,
      score: run.score,
      error: run.error,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      delta:
        run.status === "done" && run.score !== null && prev?.score != null
          ? run.score - prev.score
          : null,
    };
  });
  return Response.json({ runs: withDelta, aiConfigured: isAiConfigured() });
});

export const POST = withAuth(async (session) => {
  if (!isAiConfigured()) {
    return apiError(
      409,
      "ai_not_configured",
      "Configure seu provedor de IA para rodar o Laboratório"
    );
  }
  try {
    const runId = await startRun(session.organizationId);
    return Response.json({ runId }, { status: 202 });
  } catch (err) {
    if (err instanceof RunConflictError) {
      return apiError(
        409,
        "run_in_progress",
        "Já há uma rodada em andamento; aguarde terminar"
      );
    }
    throw err;
  }
});
