import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getAdapter, UnofficialApiError } from "@/lib/unofficial";
import {
  apiKeyLast4,
  deleteChannel,
  getChannelByOrg,
  saveChannel,
  updateChannelStatus,
  webhookUrlFor,
} from "@/server/unofficial/channel";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const channel = await getChannelByOrg(session.organizationId);
  if (!channel) return Response.json({ channel: null });
  return Response.json({
    channel: {
      provider: channel.provider,
      baseUrl: channel.baseUrl,
      instanceName: channel.instanceName,
      apiKeyLast4: apiKeyLast4(channel.apiKey),
      status: channel.status,
      displayPhoneNumber: channel.displayPhoneNumber,
      webhookUrl: webhookUrlFor(channel),
    },
  });
});

const putSchema = z.object({
  provider: z.enum(["evolution", "wppconnect", "waha"]),
  baseUrl: z.string().trim().url(),
  instanceName: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
});

/**
 * Guarda el canal: valida credenciales contra el gateway, cifra la key
 * e intenta auto-configurar el webhook (best-effort según proveedor).
 */
export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  const adapter = getAdapter(body.data.provider);
  const cfg = {
    provider: body.data.provider,
    baseUrl: body.data.baseUrl.replace(/\/+$/, ""),
    instanceName: body.data.instanceName,
    apiKey: body.data.apiKey,
  };

  // Validación real contra el gateway antes de persistir.
  try {
    await adapter.getStatus(cfg);
  } catch (err) {
    if (err instanceof UnofficialApiError) {
      const status = err.status === 0 || err.status >= 500 ? 503 : 422;
      return apiError(status, "gateway_error", err.message);
    }
    throw err;
  }

  const channel = await saveChannel({
    organizationId: session.organizationId,
    ...cfg,
  });

  const webhookUrl = webhookUrlFor(channel);
  const webhookConfigured = await adapter.configureWebhook(cfg, webhookUrl);

  // Estado inicial real (puede ya estar conectado).
  try {
    const st = await adapter.getStatus(cfg);
    await updateChannelStatus(
      session.organizationId,
      st.state,
      st.phoneNumber ?? undefined
    );
  } catch {
    // se queda "disconnected"; la página de estado lo refresca
  }

  return Response.json({ ok: true, webhookUrl, webhookConfigured });
});

export const DELETE = withAuth(async (session) => {
  await deleteChannel(session.organizationId);
  return Response.json({ ok: true });
});
