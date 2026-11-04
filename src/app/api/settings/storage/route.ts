import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  getMediaConfig,
  getMediaUsage,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  purgeExpiredMedia,
  saveMediaConfig,
} from "@/server/media/maintenance";

export const dynamic = "force-dynamic";

/** Uso de armazenamento de mídia + política de retenção da organização. */
export const GET = withAuth(async (session) => {
  if (session.role === "agent") {
    return apiError(403, "forbidden", "Sem acesso às configurações de armazenamento");
  }
  const [config, usage] = await Promise.all([
    getMediaConfig(session.organizationId),
    getMediaUsage(session.organizationId),
  ]);
  return Response.json({ config, usage });
});

const putSchema = z.object({
  retentionDays: z.number().int().min(MIN_RETENTION_DAYS).max(MAX_RETENTION_DAYS).nullable(),
});

/** Só o proprietário: reduzir a retenção apaga mídia de forma definitiva. */
export const PUT = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Só o proprietário pode alterar a retenção de mídia");
  }
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  await saveMediaConfig(session.organizationId, { retentionDays: body.data.retentionDays });
  // Aplica já, sem esperar o próximo ciclo do agendador.
  if (body.data.retentionDays !== null) {
    void purgeExpiredMedia().catch((err) => console.error("[media] retenção falhou:", err));
  }
  return Response.json({ ok: true });
});
