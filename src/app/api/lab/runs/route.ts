import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { resolveAiConfig } from "@/server/ai/config";
import { NoPersonasError, RunConflictError, startRun } from "@/server/lab/runner";

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

  const departments = await db
    .select({ id: schema.department.id, name: schema.department.name })
    .from(schema.department)
    .where(eq(schema.department.organizationId, session.organizationId));
  const deptName = new Map(departments.map((d) => [d.id, d.name]));

  // Só compara score com a rodada anterior DO MESMO departamento (ou
  // ambas "geral") — senão o delta comparava avaliações de perfis/KB
  // diferentes entre si, um número sem significado.
  const withDelta = runs.map((run, i) => {
    const prev = runs
      .slice(i + 1)
      .find(
        (r) =>
          r.status === "done" && r.score !== null && r.departmentId === run.departmentId
      );
    return {
      id: run.id,
      departmentId: run.departmentId,
      departmentName: run.departmentId ? (deptName.get(run.departmentId) ?? null) : null,
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
  const aiConfig = await resolveAiConfig(session.organizationId);
  return Response.json({ runs: withDelta, aiConfigured: aiConfig !== null });
});

const createSchema = z.object({
  departmentId: z.string().trim().min(1).nullable().optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const aiConfig = await resolveAiConfig(session.organizationId);
  if (!aiConfig) {
    return apiError(
      409,
      "ai_not_configured",
      "Configure seu provedor de IA para rodar o Laboratório"
    );
  }
  try {
    const runId = await startRun(session.organizationId, body.data.departmentId ?? null);
    return Response.json({ runId }, { status: 202 });
  } catch (err) {
    if (err instanceof RunConflictError) {
      return apiError(
        409,
        "run_in_progress",
        "Já há uma rodada em andamento; aguarde terminar"
      );
    }
    if (err instanceof NoPersonasError) {
      return apiError(422, "no_personas", err.message);
    }
    throw err;
  }
});
