import {
  gatewayRequest,
  isGroupJid,
  jidToPhone,
  mediaTypeFromMime,
  toQrDataUrl,
  UnofficialApiError,
  type ChannelConfig,
  type ChannelStatus,
  type NormalizedInbound,
  type UnofficialAdapter,
} from "@/lib/unofficial/types";

/**
 * Adaptador WAHA (WhatsApp HTTP API). Docs: waha.devlike.pro
 * Auth: header `X-Api-Key`. La sesión va en el body/query.
 */

function headers(cfg: ChannelConfig): Record<string, string> {
  return { "Content-Type": "application/json", "X-Api-Key": cfg.apiKey };
}

function base(cfg: ChannelConfig): string {
  return cfg.baseUrl.replace(/\/+$/, "");
}

type WahaSendResponse = {
  id?: string | { id?: string; _serialized?: string };
};

type WahaSessionResponse = {
  status?: string;
  me?: { id?: string; pushName?: string };
};

type WahaQrResponse = { value?: string; data?: string };

type WahaWebhookBody = {
  event?: string;
  session?: string;
  payload?: {
    id?: string;
    from?: string;
    fromMe?: boolean;
    body?: string;
    timestamp?: number | string;
    hasMedia?: boolean;
    media?: { url?: string; mimetype?: string; filename?: string };
    _data?: { notifyName?: string; type?: string };
  };
};

function extractId(
  id: string | { id?: string; _serialized?: string } | undefined
): string | null {
  if (!id) return null;
  if (typeof id === "string") return id;
  return id._serialized ?? id.id ?? null;
}

function mapStatus(status: string | undefined): ChannelStatus["state"] {
  switch ((status ?? "").toUpperCase()) {
    case "WORKING":
      return "connected";
    case "STARTING":
    case "SCAN_QR_CODE":
      return "connecting";
    default:
      return "disconnected";
  }
}

export const wahaAdapter: UnofficialAdapter = {
  provider: "waha",

  async sendText(cfg, to, text) {
    const res = await gatewayRequest<WahaSendResponse>(
      `${base(cfg)}/api/sendText`,
      {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({
          session: cfg.instanceName,
          chatId: `${to}@c.us`,
          text,
        }),
      }
    );
    return extractId(res.id) ?? `waha-${Date.now()}`;
  },

  async getStatus(cfg) {
    let session: WahaSessionResponse;
    try {
      session = await gatewayRequest<WahaSessionResponse>(
        `${base(cfg)}/api/sessions/${encodeURIComponent(cfg.instanceName)}`,
        { headers: headers(cfg) }
      );
    } catch (err) {
      if (err instanceof UnofficialApiError && err.status === 404) {
        // Sesión inexistente: intentar crearla/arrancarla (best-effort).
        try {
          await gatewayRequest(`${base(cfg)}/api/sessions/start`, {
            method: "POST",
            headers: headers(cfg),
            body: JSON.stringify({ name: cfg.instanceName }),
          });
        } catch {
          // ignorar: el estado seguirá como disconnected
        }
        return { state: "connecting", qrCode: null, phoneNumber: null };
      }
      throw err;
    }

    const state = mapStatus(session.status);
    const phoneNumber = session.me?.id ? jidToPhone(session.me.id) : null;
    if (state === "connected") {
      return { state, qrCode: null, phoneNumber };
    }

    let qrCode: string | null = null;
    if ((session.status ?? "").toUpperCase() === "SCAN_QR_CODE") {
      try {
        const qr = await gatewayRequest<WahaQrResponse>(
          `${base(cfg)}/api/${encodeURIComponent(cfg.instanceName)}/auth/qr?format=raw`,
          { headers: { ...headers(cfg), Accept: "application/json" } }
        );
        // format=raw devuelve { value } (texto del QR); pedir imagen si hay.
        qrCode = toQrDataUrl(qr.data ?? null);
        if (!qrCode && qr.value) {
          // Sin imagen: la UI puede renderizar el texto — se marca con prefijo.
          qrCode = `qr-text:${qr.value}`;
        }
      } catch {
        // best-effort
      }
    }
    return { state, qrCode, phoneNumber };
  },

  parseWebhook(body) {
    const payload = body as WahaWebhookBody;
    if ((payload.event ?? "") !== "message") return [];
    const p = payload.payload;
    if (!p?.id || !p.from || isGroupJid(p.from)) return [];
    const mediaUrl =
      p.media?.url && /^https?:\/\//i.test(p.media.url) ? p.media.url : null;
    const out: NormalizedInbound[] = [
      {
        from: jidToPhone(p.from),
        providerMessageId: p.id,
        fromMe: p.fromMe ?? false,
        pushName: p._data?.notifyName ?? null,
        // Em mídia com hasMedia, body costuma ser a legenda.
        text: p.body ?? null,
        timestamp: p.timestamp ?? null,
        type: p.hasMedia
          ? mediaTypeFromMime(p.media?.mimetype)
          : "text",
        mediaUrl,
      },
    ];
    return out;
  },

  mediaAuthHeaders(cfg) {
    return { "X-Api-Key": cfg.apiKey };
  },

  async configureWebhook(cfg, webhookUrl) {
    // WAHA Plus permite actualizar la sesión con webhooks; core: al crear.
    try {
      await gatewayRequest(
        `${base(cfg)}/api/sessions/${encodeURIComponent(cfg.instanceName)}`,
        {
          method: "PUT",
          headers: headers(cfg),
          body: JSON.stringify({
            config: {
              webhooks: [{ url: webhookUrl, events: ["message"] }],
            },
          }),
        }
      );
      return true;
    } catch {
      return false;
    }
  },
};
