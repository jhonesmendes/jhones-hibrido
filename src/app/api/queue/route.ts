import { withAuth } from "@/lib/api";
import { resolvePermissions, departmentRole } from "@/lib/auth/require-permission";
import { listDepartments, listMemberDepartments } from "@/server/settings/departments";
import { listDepartmentQueue } from "@/server/queue/manager";

export const dynamic = "force-dynamic";

/**
 * Fila de atendimento — owner e quem tem `conversations:view_all` veem todo
 * departamento com fila ativa; qualquer membro do departamento (admin ou
 * agente comum, em qualquer modo de distribuição) vê a fila do(s) seu(s).
 *
 * Antes disso só liberava agente comum em modo `manual` — em modo
 * automático ele dependia 100% do toast em tempo real
 * (`onQueueAssigned`) pra saber que foi designado; se perdesse o toast
 * (aba fechada, timeout expirado antes de ver), não tinha pra onde voltar
 * e checar. Agora a aba Fila é sempre um retorno seguro: mostra a
 * designação em andamento e, se ela expirar e voltar pra `waiting`, fica
 * visível (e "pegável" via POST .../claim) pra qualquer um do
 * departamento — não só em modo manual.
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
        .filter(({ d, role }) => d.queueEnabled && role !== null)
        .map(({ d }) => d.id);
    }
  }

  const entries = await listDepartmentQueue(departmentIds);
  return Response.json({ entries });
});
