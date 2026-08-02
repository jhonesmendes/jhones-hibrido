import { apiError, withAuth } from "@/lib/api";
import { getUnofficialChannelById } from "@/server/settings/unofficial-channels";
import { disconnect } from "@/server/baileys/manager";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Logout — reseta o auth-state, mas mantém o canal (nome/departamento)
 * para reconectar com um QR novo depois. Remover o canal por completo é
 * o `DELETE` em `/api/settings/channels/unofficial/[id]`. */
export const POST = withAuth(async (session, req: Request, { params }: Params) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin gerenciam canais");
  }
  const { id } = await params;
  const channel = await getUnofficialChannelById(id, session.organizationId);
  if (!channel) return apiError(404, "not_found", "Canal não encontrado");

  await disconnect(id);

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
