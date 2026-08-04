import { withAuth } from "@/lib/api";
import { resolvePermissions, departmentRole } from "@/lib/auth/require-permission";
import { listDepartments, listMemberDepartments } from "@/server/settings/departments";
import { listDepartmentQueue } from "@/server/queue/manager";

export const dynamic = "force-dynamic";

/**
 * Fila de atendimento (Sprint Q2) — owner e quem tem `conversations:view_all`
 * veem todo departamento com fila ativa; admin de departamento vê só o(s)
 * seu(s). Agente comum de um depto em modo `manual` (Sprint Q4) também vê
 * o próprio — é assim que ele "pega" uma conversa da fila (POST
 * .../claim), já que nesse modo o sistema nunca designa sozinho. Fora
 * disso, agente comum não vê nada aqui — recebe a conversa via
 * notificação quando é designado (toast/push), não navegando pela fila
 * alheia.
 */
export const GET = withAuth(async (session) => {
  let departmentIds: string[];

  if (session.role === "owner") {
    departmentIds = (await listDepartments(session.organizationId))
      .filter((d) => d.queueEnabled)
      .map((d) => d.id);
  } else {
    const effective = await resolvePermissions(session.memberId, session.role);
    const myDepartments = await listMemberDepartments(session.memberId);
    if (effective.has("conversations:view_all")) {
      departmentIds = myDepartments.filter((d) => d.queueEnabled).map((d) => d.id);
    } else {
      const roles = await Promise.all(
        myDepartments.map(async (d) => ({ d, role: await departmentRole(session.memberId, d.id) }))
      );
      departmentIds = roles
        .filter(
          ({ d, role }) => d.queueEnabled && (role === "admin" || d.distributionMode === "manual")
        )
        .map(({ d }) => d.id);
    }
  }

  const entries = await listDepartmentQueue(departmentIds);
  return Response.json({ entries });
});
