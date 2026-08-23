import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const db = getDb();
  // ?departmentId= deixa quem já sabe o departamento certo (ex.: painel de
  // detalhes do inbox, mostrando o departamento da conversa em foco, que
  // pode não bater com o departamento ativo da sessão) pedir esse
  // especificamente; sem o param, cai no departamento ativo (comportamento
  // de antes).
  const departmentIdParam = new URL(req.url).searchParams.get("departmentId");
  const departmentId = departmentIdParam !== null ? departmentIdParam || null : session.activeDepartmentId;
  const stages = await db
    .select()
    .from(schema.pipelineStage)
    .where(
      scoped(
        schema.pipelineStage.organizationId,
        session.organizationId,
        departmentId ? eq(schema.pipelineStage.departmentId, departmentId) : undefined
      )
    )
    .orderBy(asc(schema.pipelineStage.position));
  return Response.json({ stages });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const activeDepartmentId = session.activeDepartmentId;
  const maxPos = await db
    .select({
      max: sql<number>`coalesce(max(${schema.pipelineStage.position}), -1)`,
    })
    .from(schema.pipelineStage)
    .where(
      scoped(
        schema.pipelineStage.organizationId,
        session.organizationId,
        activeDepartmentId ? eq(schema.pipelineStage.departmentId, activeDepartmentId) : undefined
      )
    );

  const inserted = await db
    .insert(schema.pipelineStage)
    .values({
      id: newId("stage"),
      organizationId: session.organizationId,
      departmentId: activeDepartmentId,
      name: body.data.name,
      position: (maxPos[0]?.max ?? -1) + 1,
      kind: "open",
    })
    .returning();
  return Response.json({ stage: inserted[0] }, { status: 201 });
});
