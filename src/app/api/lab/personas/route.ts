import { asc } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { resolveAiConfig } from "@/server/ai/config";
import { generatePersonaScript } from "@/server/lab/persona-generator";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const db = getDb();
  const personas = await db
    .select()
    .from(schema.labPersona)
    .where(scoped(schema.labPersona.organizationId, session.organizationId))
    .orderBy(asc(schema.labPersona.createdAt));
  return Response.json({ personas });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scenarioDescription: z.string().trim().min(1).max(1000),
  // null/ausente = geral, entra em qualquer rodada do Laboratório.
  departmentId: z.string().trim().min(1).nullable().optional(),
});

/** Gera o roteiro por IA a partir da descrição do cenário e já salva a
 * persona pronta — sem uma etapa manual separada de "escrever as falas". */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const aiConfig = await resolveAiConfig(session.organizationId);
  if (!aiConfig) {
    return apiError(
      409,
      "ai_not_configured",
      "Configure seu provedor de IA para gerar o roteiro"
    );
  }

  const generated = await generatePersonaScript({
    name: body.data.name,
    scenarioDescription: body.data.scenarioDescription,
    aiConfig,
  });
  if (!generated.ok) {
    return apiError(422, "generation_failed", generated.detail);
  }

  const db = getDb();
  const inserted = await db
    .insert(schema.labPersona)
    .values({
      id: newId("labPersona"),
      organizationId: session.organizationId,
      departmentId: body.data.departmentId ?? null,
      name: body.data.name,
      scenarioDescription: body.data.scenarioDescription,
      script: generated.script,
    })
    .returning();
  return Response.json({ persona: inserted[0] }, { status: 201 });
});
