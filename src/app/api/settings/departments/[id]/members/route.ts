import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  addDepartmentMember,
  listDepartmentMembers,
} from "@/server/settings/departments";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Confirma que o departamento é da organização da sessão antes de mexer
 * nos membros dele (isolamento de tenant também nas sub-rotas). */
async function assertDepartmentInOrg(
  id: string,
  organizationId: string
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.department.id })
    .from(schema.department)
    .where(
      and(eq(schema.department.id, id), scoped(schema.department.organizationId, organizationId))
    )
    .limit(1);
  return rows.length > 0;
}

export const GET = withAuth(async (session, _req: Request, { params }: Params) => {
  const { id } = await params;
  if (!(await assertDepartmentInOrg(id, session.organizationId))) {
    return apiError(404, "not_found", "Departamento não encontrado");
  }
  const members = await listDepartmentMembers(id);
  return Response.json({ members });
});

const postSchema = z.object({
  memberId: z.string().trim().min(1),
  role: z.enum(["admin", "agent"]).default("agent"),
});

export const POST = withAuth(async (session, req: Request, { params }: Params) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Só o proprietário pode gerenciar membros do departamento");
  }
  const { id } = await params;
  if (!(await assertDepartmentInOrg(id, session.organizationId))) {
    return apiError(404, "not_found", "Departamento não encontrado");
  }
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const memberRows = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.id, body.data.memberId),
        scoped(schema.member.organizationId, session.organizationId)
      )
    )
    .limit(1);
  if (!memberRows[0]) {
    return apiError(404, "not_found", "Membro não encontrado nesta organização");
  }

  await addDepartmentMember(id, body.data.memberId, body.data.role);

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "department.member_added",
    resource: "department",
    resourceId: id,
    req,
  });

  return Response.json({ ok: true }, { status: 201 });
});
