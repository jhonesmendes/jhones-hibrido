import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { logAudit } from "@/server/auth/audit";
import {
  getInboundQueueStats,
  getInboundWebhookView,
  saveInboundWebhook,
} from "@/server/n8n/inbound-events";

export const dynamic = "force-dynamic";

function requireAdmin(role: string) {
  return role === "owner" || role === "admin";
}

export const GET = withAuth(async (session) => {
  if (!requireAdmin(session.role)) {
    return apiError(403, "forbidden", "Só owner/admin veem a configuração do N8N");
  }
  const [webhook, queue] = await Promise.all([
    getInboundWebhookView(session.organizationId),
    getInboundQueueStats(session.organizationId),
  ]);
  return Response.json({ webhook, queue });
});

const putSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "Use uma URL http(s)")
    .nullable(),
  token: z.string().trim().min(1).max(500).nullable().optional(),
});

export const PUT = withAuth(async (session, req: Request) => {
  if (!requireAdmin(session.role)) {
    return apiError(403, "forbidden", "Só owner/admin configuram o N8N");
  }
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  const saved = await saveInboundWebhook(session.organizationId, body.data);
  if (!saved) return apiError(409, "not_configured", "Configure o servidor N8N primeiro");
  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "settings.n8n_changed",
    resource: "n8n_config",
    req,
    metadata: { inboundWebhook: Boolean(body.data.url) },
  });
  return Response.json({ ok: true });
});
