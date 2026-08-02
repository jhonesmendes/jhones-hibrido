import { asc } from "drizzle-orm";
import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { resolveAiConfig } from "@/server/ai/config";

export const dynamic = "force-dynamic";

/** Lista todos os perfis de agente da organização (v0.1: N, não mais 1). */
export const GET = withAuth(async (session) => {
  const db = getDb();
  const profiles = await db
    .select()
    .from(schema.agentProfile)
    .where(scoped(schema.agentProfile.organizationId, session.organizationId))
    .orderBy(asc(schema.agentProfile.createdAt));
  const aiConfig = await resolveAiConfig(session.organizationId);
  return Response.json({ profiles, aiConfigured: aiConfig !== null });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  tone: z.string().max(500).nullable().optional(),
  instructions: z.string().max(8000).nullable().optional(),
  escalationRules: z.string().max(4000).nullable().optional(),
  greeting: z.string().max(1000).nullable().optional(),
  enabled: z.boolean().optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const inserted = await db
    .insert(schema.agentProfile)
    .values({
      id: newId("agentProfile"),
      organizationId: session.organizationId,
      ...body.data,
    })
    .returning();
  return Response.json({ profile: inserted[0] }, { status: 201 });
});
