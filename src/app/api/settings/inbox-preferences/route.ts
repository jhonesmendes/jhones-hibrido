import { eq } from "drizzle-orm";
import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Preferência pessoal (por membro, não por organização): mensagens de
 * grupo misturadas na aba "Todas" da Caixa de Entrada ou só na aba
 * "Grupos". Cada membro lê/grava a sua própria — sem checagem extra de
 * papel, é o próprio registro em `member` identificado pela sessão.
 */
export const GET = withAuth(async (session) => {
  const db = getDb();
  const rows = await db
    .select({ groupsInInbox: schema.member.groupsInInbox })
    .from(schema.member)
    .where(eq(schema.member.id, session.memberId))
    .limit(1);
  return Response.json({ groupsInInbox: rows[0]?.groupsInInbox ?? true });
});

const putSchema = z.object({ groupsInInbox: z.boolean() });

export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  const db = getDb();
  await db
    .update(schema.member)
    .set({ groupsInInbox: body.data.groupsInInbox })
    .where(eq(schema.member.id, session.memberId));
  return Response.json({ ok: true });
});
