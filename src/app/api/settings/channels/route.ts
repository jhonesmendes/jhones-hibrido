import { withAuth } from "@/lib/api";
import { connect, disconnect, getLiveStatus } from "@/server/baileys/manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Estado inicial (la actualización en vivo llega por SSE, evento `channel.status`). */
export const GET = withAuth(async (session) => {
  const status = await getLiveStatus(session.organizationId);
  return Response.json(status);
});

/** Inicia la conexión — el QR y el estado llegan por SSE, no en esta respuesta. */
export const POST = withAuth(async (session) => {
  void connect(session.organizationId);
  return Response.json({ started: true });
});

export const DELETE = withAuth(async (session) => {
  await disconnect(session.organizationId);
  return Response.json({ ok: true });
});
