import { apiError, withAuth } from "@/lib/api";
import { requirePermission } from "@/lib/auth/require-permission";
import { resolveN8nConfig } from "@/server/n8n/config";
import { executeWorkflow, N8nApiError } from "@/server/n8n/client";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Executa um workflow do N8N com um clique — mesma permissão de disparar campanhas. */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  await requirePermission(session, "campaigns:send");
  const { id } = await ctx.params;

  const creds = await resolveN8nConfig(session.organizationId);
  if (!creds) {
    return apiError(409, "not_configured", "Configure o N8N antes de executar um workflow");
  }

  try {
    const result = await executeWorkflow(creds, id);
    await logAudit({
      organizationId: session.organizationId,
      memberId: session.memberId,
      action: "n8n.workflow_executed",
      resource: "n8n_workflow",
      resourceId: id,
      req,
      metadata: { executionId: result.executionId },
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof N8nApiError) {
      const status = err.code === "unauthorized" ? 401 : err.code === "not_found" ? 404 : 502;
      return apiError(status, err.code, err.message);
    }
    throw err;
  }
});
