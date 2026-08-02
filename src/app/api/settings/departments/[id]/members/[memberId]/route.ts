import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  addDepartmentMember,
  removeDepartmentMember,
} from "@/server/settings/departments";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; memberId: string }> };

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

const patchSchema = z.object({ role: z.enum(["admin", "agent"]) });

/** Troca o role do membro dentro do departamento (não o role de org). */
export const PATCH = withAuth(async (session, req: Request, { params }: Params) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Só o proprietário pode gerenciar membros do departamento");
  }
  const { id, memberId } = await params;
  if (!(await assertDepartmentInOrg(id, session.organizationId))) {
    return apiError(404, "not_found", "Departamento não encontrado");
  }
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  await addDepartmentMember(id, memberId, body.data.role);
  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (session, req: Request, { params }: Params) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Só o proprietário pode gerenciar membros do departamento");
  }
  const { id, memberId } = await params;
  if (!(await assertDepartmentInOrg(id, session.organizationId))) {
    return apiError(404, "not_found", "Departamento não encontrado");
  }

  await removeDepartmentMember(id, memberId);

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "department.member_removed",
    resource: "department",
    resourceId: id,
    req,
  });

  return Response.json({ ok: true });
});
