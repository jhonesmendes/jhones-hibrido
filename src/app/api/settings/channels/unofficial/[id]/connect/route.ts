import { apiError, withAuth } from "@/lib/api";
import { getUnofficialChannelById } from "@/server/settings/unofficial-channels";
import { connect } from "@/server/baileys/manager";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Inicia a conexão deste canal — o QR e o estado chegam por SSE
 * (`channel.status`, com `channelId`), não nesta resposta. */
export const POST = withAuth(async (session, req: Request, { params }: Params) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin gerenciam canais");
  }
  const { id } = await params;
  const channel = await getUnofficialChannelById(id, session.organizationId);
  if (!channel) return apiError(404, "not_found", "Canal não encontrado");

  void connect(id, { organizationId: session.organizationId });

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "channel.connected",
    resource: "unofficial_channel",
    resourceId: id,
    req,
  });

  return Response.json({ started: true });
});
