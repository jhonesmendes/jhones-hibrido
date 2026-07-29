import { withAuth } from "@/lib/api";
import { requirePermission } from "@/lib/auth/require-permission";
import { resolveN8nConfig } from "@/server/n8n/config";
import { listWorkflows, N8nApiError } from "@/server/n8n/client";

export const dynamic = "force-dynamic";

/**
 * Lista os workflows do N8N do operador. Sem N8N configurado, responde
 * `{ configured: false }` em vez de erro — a aba de Automações nunca trava.
 */
export const GET = withAuth(async (session) => {
  await requirePermission(session, "campaigns:view");

  const creds = await resolveN8nConfig(session.organizationId);
  if (!creds) return Response.json({ configured: false, workflows: [] });

  try {
    const workflows = await listWorkflows(creds);
    return Response.json({ configured: true, workflows });
  } catch (err) {
    if (err instanceof N8nApiError) {
      return Response.json(
        { configured: true, workflows: [], error: err.message },
        { status: 200 }
      );
    }
    throw err;
  }
});
