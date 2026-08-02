import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Departamento ativo — preferência pessoal do membro (igual a
 * `groupsInInbox` em inbox-preferences), não estado de sessão do
 * better-auth. Qualquer membro autenticado lê/grava a sua própria; não há
 * checagem de papel aqui — a restrição real é o membro só poder escolher
 * um departamento ao qual pertence, verificado em `PUT` abaixo (owner pode
 * escolher qualquer um, inclusive null = visão consolidada).
 */
export const GET = withAuth(async (session) => {
  return Response.json({ activeDepartmentId: session.activeDepartmentId });
});

const putSchema = z.object({ departmentId: z.string().trim().min(1).nullable() });

export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  const db = getDb();

  // Owner pode escolher qualquer departamento (ou null = visão consolidada);
  // os demais só podem ativar um departamento ao qual pertencem de fato.
  if (body.data.departmentId && session.role !== "owner") {
    const rows = await db
      .select({ id: schema.memberDepartment.id })
      .from(schema.memberDepartment)
      .where(
        and(
          eq(schema.memberDepartment.memberId, session.memberId),
          eq(schema.memberDepartment.departmentId, body.data.departmentId)
        )
      )
      .limit(1);
    if (!rows[0]) {
      return Response.json(
        { error: { code: "forbidden", message: "Você não pertence a este departamento" } },
        { status: 403 }
      );
    }
  }

  await db
    .update(schema.member)
    .set({ activeDepartmentId: body.data.departmentId })
    .where(eq(schema.member.id, session.memberId));

  return Response.json({ ok: true });
});
