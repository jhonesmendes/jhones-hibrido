import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createDepartment,
  listDepartments,
  listMemberDepartments,
} from "@/server/settings/departments";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";

/** Lista aberta a qualquer membro autenticado (o seletor de departamento na
 * sidebar precisa disso mesmo para quem não é owner). Owner vê todos os
 * departamentos da organização (visão consolidada); os demais só veem os
 * departamentos aos quais pertencem — o mesmo escopo que `PUT
 * /api/settings/active-department` já impõe para trocar de departamento. */
export const GET = withAuth(async (session) => {
  const departments =
    session.role === "owner"
      ? await listDepartments(session.organizationId)
      : await listMemberDepartments(session.memberId);
  return Response.json({ departments });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(280).optional(),
  color: z.string().trim().max(20).optional(),
  icon: z.string().trim().max(40).optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Só o proprietário pode criar departamentos");
  }
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const department = await createDepartment(session.organizationId, body.data);

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "department.created",
    resource: "department",
    resourceId: department.id,
    req,
  });

  return Response.json({ department }, { status: 201 });
});
