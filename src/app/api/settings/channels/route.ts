import { withAuth } from "@/lib/api";
import { connect, disconnect, getLiveStatus } from "@/server/baileys/manager";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Estado inicial (a atualização ao vivo chega por SSE, evento `channel.status`). */
export const GET = withAuth(async (session) => {
  const status = await getLiveStatus(session.organizationId);
  return Response.json(status);
});

/** Inicia a conexão — o QR e o estado chegam por SSE, não nesta resposta. */
export const POST = withAuth(async (session, req: Request) => {
  void connect(session.organizationId);
  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "channel.connected",
    resource: "unofficial_channel",
    req,
  });
  return Response.json({ started: true });
});

export const DELETE = withAuth(async (session, req: Request) => {
  await disconnect(session.organizationId);
  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "channel.disconnected",
    resource: "unofficial_channel",
    req,
  });
  return Response.json({ ok: true });
});
