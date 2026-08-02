import { withAuth } from "@/lib/api";
import { resolveChannelAccess } from "@/lib/auth/require-permission";
import { isOfficialChannelConnected } from "@/server/whatsapp/credentials";
import { isAnyUnofficialChannelConnected } from "@/server/settings/unofficial-channels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Canais que o membro da sessão pode usar para ENVIAR agora: conectados na
 * organização E liberados por permissão (`member_channel.canSend`). Usado
 * pelo seletor manual de canal no composer (override pontual, sem alterar
 * o roteamento automático "sticky" da conversa).
 */
export const GET = withAuth(async (session) => {
  const [officialConnected, unofficialConnected, officialAccess, unofficialAccess] =
    await Promise.all([
      isOfficialChannelConnected(session.organizationId),
      isAnyUnofficialChannelConnected(session.organizationId),
      resolveChannelAccess(session.memberId, session.role, "official"),
      resolveChannelAccess(session.memberId, session.role, "unofficial"),
    ]);

  return Response.json({
    official: officialConnected && officialAccess.canSend,
    unofficial: unofficialConnected && unofficialAccess.canSend,
  });
});
