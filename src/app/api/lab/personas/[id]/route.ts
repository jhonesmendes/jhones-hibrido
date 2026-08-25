import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { resolveAiConfig } from "@/server/ai/config";
import { generatePersonaScript } from "@/server/lab/persona-generator";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  scenarioDescription: z.string().trim().min(1).max(1000).optional(),
  departmentId: z.string().trim().min(1).nullable().optional(),
  // Roteiro editado à mão (ex.: ajustar uma fala gerada) — ignorado se
  // `regenerate` vier junto (a IA decide o roteiro final nesse caso).
  script: z.array(z.string().trim().min(1).max(300)).min(2).max(8).optional(),
  // Chama a IA de novo com o nome/cenário atuais (já mesclados com o body)
  // pra gerar um roteiro novo, no lugar de editar linha a linha.
  regenerate: z.boolean().optional(),
});

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const existingRows = await db
    .select()
    .from(schema.labPersona)
    .where(
      scoped(
        schema.labPersona.organizationId,
        session.organizationId,
        eq(schema.labPersona.id, id)
      )
    )
    .limit(1);
  const existing = existingRows[0];
  if (!existing) return apiError(404, "not_found", "Persona não encontrada");

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (body.data.name !== undefined) set.name = body.data.name;
  if (body.data.scenarioDescription !== undefined) {
    set.scenarioDescription = body.data.scenarioDescription;
  }
  if (body.data.departmentId !== undefined) set.departmentId = body.data.departmentId;
  if (body.data.script !== undefined) set.script = body.data.script;

  if (body.data.regenerate) {
    const aiConfig = await resolveAiConfig(session.organizationId);
    if (!aiConfig) {
      return apiError(
        409,
        "ai_not_configured",
        "Configure seu provedor de IA para gerar o roteiro"
      );
    }
    const generated = await generatePersonaScript({
      name: (set.name as string | undefined) ?? existing.name,
      scenarioDescription:
        (set.scenarioDescription as string | undefined) ?? existing.scenarioDescription,
      aiConfig,
    });
    if (!generated.ok) return apiError(422, "generation_failed", generated.detail);
    set.script = generated.script;
  }

  const updated = await db
    .update(schema.labPersona)
    .set(set)
    .where(eq(schema.labPersona.id, id))
    .returning();
  return Response.json({ persona: updated[0] });
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const db = getDb();
  const deleted = await db
    .delete(schema.labPersona)
    .where(
      scoped(
        schema.labPersona.organizationId,
        session.organizationId,
        eq(schema.labPersona.id, id)
      )
    )
    .returning();
  if (!deleted[0]) return apiError(404, "not_found", "Persona não encontrada");
  return Response.json({ deleted: true });
});
