import { apiError, withAuth } from "@/lib/api";
import { sendInboundTest } from "@/server/n8n/inbound-events";

export const dynamic = "force-dynamic";

/** Dispara `{ event: "test" }` no webhook salvo. */
export const POST = withAuth(async (session) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin testam o webhook do N8N");
  }
  try {
    await sendInboundTest(session.organizationId);
    return Response.json({ ok: true });
  } catch (err) {
    return apiError(422, "webhook_failed", err instanceof Error ? err.message : "Falha no webhook");
  }
});
