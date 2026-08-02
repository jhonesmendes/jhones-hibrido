import { apiError, withAuth } from "@/lib/api";
import { getDashboardData } from "@/server/dashboard/queries";
import { listMemberDepartments } from "@/server/settings/departments";

export const dynamic = "force-dynamic";

/**
 * Dashboard — owner vê tudo (todos os departamentos + o que ainda não tem
 * departamento). Admin vê só os departamentos aos quais pertence
 * (`member_department`), sem o bucket "Sem departamento" (não é dele).
 * Agente comum não tem acesso — 403.
 *
 * `?departmentId=` restringe a visão a 1 departamento específico — vale
 * tanto para owner (filtra a visão consolidada) quanto para admin (desde
 * que seja um dos departamentos dele).
 */
export const GET = withAuth(async (session, req: Request) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Dashboard disponível só para proprietário e administradores");
  }

  let visibleDepartmentIds: string[] | null = null;
  if (session.role !== "owner") {
    const myDepartments = await listMemberDepartments(session.memberId);
    visibleDepartmentIds = myDepartments.map((d) => d.id);
    if (visibleDepartmentIds.length === 0) {
      return apiError(
        403,
        "forbidden",
        "Você não pertence a nenhum departamento ainda — peça para o proprietário te adicionar em Configurações → Departamentos"
      );
    }
  }

  const url = new URL(req.url);
  const departmentIdParam = url.searchParams.get("departmentId");
  if (departmentIdParam) {
    if (visibleDepartmentIds !== null && !visibleDepartmentIds.includes(departmentIdParam)) {
      return apiError(403, "forbidden", "Você não pertence a este departamento");
    }
    visibleDepartmentIds = [departmentIdParam];
  }

  const data = await getDashboardData(session.organizationId, visibleDepartmentIds);
  return Response.json(data);
});
