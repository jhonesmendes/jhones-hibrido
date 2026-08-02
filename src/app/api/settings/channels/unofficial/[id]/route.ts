import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  deleteUnofficialChannel,
  getUnofficialChannelById,
  updateUnofficialChannelMeta,
} from "@/server/settings/unofficial-channels";
import { disconnect } from "@/server/baileys/manager";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  isActive: z.boolean().optional(),
  departmentId: z.string().trim().min(1).nullable().optional(),
});

export const PATCH = withAuth(async (session, req: Request, { params }: Params) => {
  const { id } = await params;
  const existing = await getUnofficialChannelById(id, session.organizationId);
  if (!existing) return apiError(404, "not_found", "Canal não encontrado");

  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  await updateUnofficialChannelMeta(id, session.organizationId, body.data);
  return Response.json({ ok: true });
});

/** Remove o canal por completo: desconecta o socket (se ativo) antes de
 * apagar a linha — diferente de `disconnect`, que só reseta o auth-state e
 * mantém o canal para reconectar depois. */
export const DELETE = withAuth(async (session, req: Request, { params }: Params) => {
  const { id } = await params;
  const existing = await getUnofficialChannelById(id, session.organizationId);
  if (!existing) return apiError(404, "not_found", "Canal não encontrado");

  await disconnect(id);
  await deleteUnofficialChannel(id, session.organizationId);

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "channel.disconnected",
    resource: "unofficial_channel",
    resourceId: id,
    req,
  });

  return Response.json({ ok: true });
});
