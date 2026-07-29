import { withAuth } from "@/lib/api";
import { requirePermission } from "@/lib/auth/require-permission";
import { resolveN8nConfig } from "@/server/n8n/config";
import { listExecutions, N8nApiError } from "@/server/n8n/client";

export const dynamic = "force-dynamic";

/** Histórico de execuções de um workflow (ou de todos, sem `workflowId`). */
export const GET = withAuth(async (session, req: Request) => {
  await requirePermission(session, "campaigns:view");

  const creds = await resolveN8nConfig(session.organizationId);
  if (!creds) return Response.json({ configured: false, executions: [] });

  const workflowId = new URL(req.url).searchParams.get("workflowId") ?? undefined;
  try {
    const executions = await listExecutions(creds, workflowId);
    return Response.json({ configured: true, executions });
  } catch (err) {
    if (err instanceof N8nApiError) {
      return Response.json(
        { configured: true, executions: [], error: err.message },
        { status: 200 }
      );
    }
    throw err;
  }
});
