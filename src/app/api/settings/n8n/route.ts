import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getN8nConfigView, saveN8nConfig, deleteN8nConfig } from "@/server/n8n/config";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";

function requireAdmin(role: string) {
  return role === "owner" || role === "admin";
}

export const GET = withAuth(async (session) => {
  if (!requireAdmin(session.role)) {
    return apiError(403, "forbidden", "Só owner/admin veem a configuração do N8N");
  }
  const config = await getN8nConfigView(session.organizationId);
  return Response.json({ config });
});

const putSchema = z.object({
  baseUrl: z.string().trim().url(),
  apiKey: z.string().trim().min(1).optional(),
});

export const PUT = withAuth(async (session, req: Request) => {
  if (!requireAdmin(session.role)) {
    return apiError(403, "forbidden", "Só owner/admin configuram o N8N");
  }
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  try {
    await saveN8nConfig(session.organizationId, body.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível salvar";
    return apiError(422, "invalid", message);
  }

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "settings.n8n_changed",
    resource: "n8n_config",
    req,
  });

  return Response.json({ ok: true });
});

/** Remove a configuração — a aba de Automações volta ao estado "não configurado". */
export const DELETE = withAuth(async (session, req: Request) => {
  if (!requireAdmin(session.role)) {
    return apiError(403, "forbidden", "Só owner/admin removem a configuração do N8N");
  }
  await deleteN8nConfig(session.organizationId);
  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "settings.n8n_changed",
    resource: "n8n_config",
    req,
    metadata: { removed: true },
  });
  return Response.json({ ok: true });
});
