import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getAiConfigView, saveAiConfig } from "@/server/ai/config";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";

function requireAdmin(role: string) {
  return role === "owner" || role === "admin";
}

export const GET = withAuth(async (session) => {
  if (!requireAdmin(session.role)) {
    return apiError(403, "forbidden", "Só owner/admin veem a configuração de IA");
  }
  const config = await getAiConfigView(session.organizationId);
  return Response.json({ config });
});

const putSchema = z.object({
  baseUrl: z.string().trim().url(),
  apiKey: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1),
  fallbackModel: z.string().trim().min(1).nullable().optional(),
  temperature: z.number().min(0).max(1),
  maxTokens: z.number().int().min(1).max(32000),
  contextMessages: z.number().int().min(1).max(200),
});

export const PUT = withAuth(async (session, req: Request) => {
  if (!requireAdmin(session.role)) {
    return apiError(403, "forbidden", "Só owner/admin configuram a IA");
  }
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  try {
    await saveAiConfig(session.organizationId, body.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível salvar";
    return apiError(422, "invalid", message);
  }

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "settings.ai_changed",
    resource: "ai_config",
    req,
  });

  return Response.json({ ok: true });
});
