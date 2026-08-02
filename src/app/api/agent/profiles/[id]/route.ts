import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  tone: z.string().max(500).nullable().optional(),
  instructions: z.string().max(8000).nullable().optional(),
  escalationRules: z.string().max(4000).nullable().optional(),
  greeting: z.string().max(1000).nullable().optional(),
  enabled: z.boolean().optional(),
});

export const PATCH = withAuth(async (session, req: Request, { params }: Params) => {
  const { id } = await params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const updated = await db
    .update(schema.agentProfile)
    .set({ ...body.data, updatedAt: new Date() })
    .where(
      and(
        eq(schema.agentProfile.id, id),
        scoped(schema.agentProfile.organizationId, session.organizationId)
      )
    )
    .returning();
  if (!updated[0]) return apiError(404, "not_found", "Perfil não encontrado");
  return Response.json({ ok: true });
});

/** Remove o perfil. Departamentos/membros/conversas que o usavam como
 * padrão voltam a `agent_profile_id = null` (FK `ON DELETE SET NULL`) e
 * caem no próximo nível da cadeia de prioridade. */
export const DELETE = withAuth(async (session, req: Request, { params }: Params) => {
  const { id } = await params;
  const db = getDb();
  const deleted = await db
    .delete(schema.agentProfile)
    .where(
      and(
        eq(schema.agentProfile.id, id),
        scoped(schema.agentProfile.organizationId, session.organizationId)
      )
    )
    .returning({ id: schema.agentProfile.id });
  if (!deleted[0]) return apiError(404, "not_found", "Perfil não encontrado");
  return Response.json({ ok: true });
});
