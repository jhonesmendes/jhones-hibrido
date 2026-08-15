import { apiError, withAuth } from "@/lib/api";
import { requirePermission } from "@/lib/auth/require-permission";
import { resolveN8nConfig } from "@/server/n8n/config";
import { deleteWorkflow, N8nApiError } from "@/server/n8n/client";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Apaga o workflow no N8N do operador — mesma permissão de disparar
 * campanhas, já que é quem também executa workflows por aqui. Ação
 * irreversível NO N8N (não só remove da lista aqui). */
export const DELETE = withAuth(async (session, req: Request, ctx: Params) => {
  await requirePermission(session, "campaigns:send");
  const { id } = await ctx.params;

  const creds = await resolveN8nConfig(session.organizationId);
  if (!creds) {
    return apiError(409, "not_configured", "Configure o N8N antes de excluir um workflow");
  }

  try {
    await deleteWorkflow(creds, id);
    await logAudit({
      organizationId: session.organizationId,
      memberId: session.memberId,
      action: "n8n.workflow_deleted",
      resource: "n8n_workflow",
      resourceId: id,
      req,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof N8nApiError) {
      const status = err.code === "unauthorized" ? 401 : err.code === "not_found" ? 404 : 502;
      return apiError(status, err.code, err.message);
    }
    throw err;
  }
});
