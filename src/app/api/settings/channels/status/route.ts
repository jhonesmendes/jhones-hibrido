import { apiError, withAuth } from "@/lib/api";
import { getAdapter, UnofficialApiError } from "@/lib/unofficial";
import {
  getChannelByOrg,
  toConfig,
  updateChannelStatus,
} from "@/server/unofficial/channel";

export const dynamic = "force-dynamic";

/**
 * Estado en vivo del gateway (+ QR si hay que escanear). La UI hace
 * polling de este endpoint mientras está en "connecting".
 */
export const GET = withAuth(async (session) => {
  const channel = await getChannelByOrg(session.organizationId);
  if (!channel) {
    return apiError(404, "not_configured", "Não há canal configurado");
  }

  const adapter = getAdapter(channel.provider);
  try {
    const st = await adapter.getStatus(toConfig(channel));
    if (st.state !== channel.status) {
      await updateChannelStatus(
        session.organizationId,
        st.state,
        st.phoneNumber ?? undefined
      );
    }
    return Response.json({
      state: st.state,
      qrCode: st.qrCode,
      phoneNumber: st.phoneNumber ?? channel.displayPhoneNumber,
    });
  } catch (err) {
    if (err instanceof UnofficialApiError) {
      const status = err.status === 0 || err.status >= 500 ? 503 : 422;
      return apiError(status, "gateway_error", err.message);
    }
    throw err;
  }
});
