import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { deleteDepartment, updateDepartment } from "@/server/settings/departments";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  color: z.string().trim().max(20).nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
  /** Perfil de agente IA padrão do departamento (v0.1, Etapa 6). */
  agentProfileId: z.string().trim().min(1).nullable().optional(),
});

export const PATCH = withAuth(async (session, req: Request, { params }: Params) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Só o proprietário pode editar departamentos");
  }
  const { id } = await params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  await updateDepartment(id, session.organizationId, body.data);

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "department.updated",
    resource: "department",
    resourceId: id,
    req,
  });

  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (session, req: Request, { params }: Params) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Só o proprietário pode remover departamentos");
  }
  const { id } = await params;
  await deleteDepartment(id, session.organizationId);

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "department.deleted",
    resource: "department",
    resourceId: id,
    req,
  });

  return Response.json({ ok: true });
});
