import { asc, eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const db = getDb();
  const runs = await db
    .select()
    .from(schema.agentTestRun)
    .where(
      scoped(
        schema.agentTestRun.organizationId,
        session.organizationId,
        eq(schema.agentTestRun.id, id)
      )
    )
    .limit(1);
  const run = runs[0];
  if (!run) return apiError(404, "not_found", "Rodada não encontrada");

  let departmentName: string | null = null;
  if (run.departmentId) {
    const deptRows = await db
      .select({ name: schema.department.name })
      .from(schema.department)
      .where(eq(schema.department.id, run.departmentId))
      .limit(1);
    departmentName = deptRows[0]?.name ?? null;
  }

  const cases = await db
    .select()
    .from(schema.agentTestCase)
    .where(eq(schema.agentTestCase.runId, id))
    .orderBy(asc(schema.agentTestCase.createdAt));

  return Response.json({
    run: {
      id: run.id,
      departmentId: run.departmentId,
      departmentName,
      status: run.status,
      score: run.score,
      error: run.error,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    },
    cases: cases.map((c) => ({
      id: c.id,
      persona: c.persona,
      // `persona` já é o nome cadastrado pelo cliente (não uma chave de um
      // elenco fixo) — não precisa mais de tabela de labels separada.
      personaLabel: c.persona,
      status: c.status,
      veredicto: c.veredicto,
      hallazgos: c.hallazgos ?? [],
      transcript: c.transcript ?? [],
    })),
  });
});

/** Só o owner apaga rodada do histórico — é um registro de avaliação, não
 * dado operacional; casos (agent_test_case) cascateiam pela FK. */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Só o proprietário pode excluir rodadas");
  }
  const { id } = await ctx.params;
  const db = getDb();
  const existing = await db
    .select({ status: schema.agentTestRun.status })
    .from(schema.agentTestRun)
    .where(
      scoped(
        schema.agentTestRun.organizationId,
        session.organizationId,
        eq(schema.agentTestRun.id, id)
      )
    )
    .limit(1);
  if (!existing[0]) return apiError(404, "not_found", "Rodada não encontrada");
  if (existing[0].status === "running") {
    return apiError(409, "run_in_progress", "Aguarde a rodada terminar antes de excluir");
  }

  await db
    .delete(schema.agentTestRun)
    .where(scoped(schema.agentTestRun.organizationId, session.organizationId, eq(schema.agentTestRun.id, id)));
  return Response.json({ deleted: true });
});
