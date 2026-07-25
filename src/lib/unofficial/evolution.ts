import {
  gatewayRequest,
  isGroupJid,
  jidToPhone,
  toQrDataUrl,
  type ChannelConfig,
  type ChannelStatus,
  type NormalizedInbound,
  type UnofficialAdapter,
} from "@/lib/unofficial/types";

/**
 * Adaptador Evolution API (v2). Docs: doc.evolution-api.com
 * Auth: header `apikey`. Instancia en el path.
 */

function headers(cfg: ChannelConfig): Record<string, string> {
  return { "Content-Type": "application/json", apikey: cfg.apiKey };
}

function base(cfg: ChannelConfig): string {
  return cfg.baseUrl.replace(/\/+$/, "");
}

type EvoSendResponse = { key?: { id?: string } };

type EvoStateResponse = {
  instance?: { state?: string };
  state?: string;
};

type EvoConnectResponse = {
  base64?: string;
  code?: string;
  instance?: { state?: string };
};

type EvoWebhookBody = {
  event?: string;
  data?: EvoMessage | EvoMessage[];
};

type EvoMessage = {
  key?: { remoteJid?: string; fromMe?: boolean; id?: string };
  pushName?: string;
  messageType?: string;
  messageTimestamp?: number | string;
  /** Presente quando a Evolution está configurada com storage de mídia (S3/minio). */
  mediaUrl?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
    documentMessage?: { caption?: string; fileName?: string };
    mediaUrl?: string;
  };
};

/** URL direta apenas se o gateway fornecer uma http(s) real (S3/minio). */
function extractMediaUrl(m: EvoMessage): string | null {
  const url = m.mediaUrl ?? m.message?.mediaUrl ?? null;
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function extractText(m: EvoMessage): string | null {
  const msg = m.message;
  if (!msg) return null;
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    msg.documentMessage?.caption ??
    null
  );
}

function normalizeType(messageType: string | undefined): string {
  switch (messageType) {
    case "conversation":
    case "extendedTextMessage":
      return "text";
    case "imageMessage":
      return "image";
    case "audioMessage":
      return "audio";
    case "videoMessage":
      return "video";
    case "documentMessage":
      return "document";
    case "stickerMessage":
      return "sticker";
    case "locationMessage":
      return "location";
    case "contactMessage":
    case "contactsArrayMessage":
      return "contacts";
    default:
      return "text";
  }
}

function mapState(state: string | undefined): ChannelStatus["state"] {
  switch (state) {
    case "open":
      return "connected";
    case "connecting":
      return "connecting";
    default:
      return "disconnected";
  }
}

export const evolutionAdapter: UnofficialAdapter = {
  provider: "evolution",

  async sendText(cfg, to, text) {
    const res = await gatewayRequest<EvoSendResponse>(
      `${base(cfg)}/message/sendText/${encodeURIComponent(cfg.instanceName)}`,
      {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({ number: to, text }),
      }
    );
    return res.key?.id ?? `evo-${Date.now()}`;
  },

  async getStatus(cfg) {
    const res = await gatewayRequest<EvoStateResponse>(
      `${base(cfg)}/instance/connectionState/${encodeURIComponent(cfg.instanceName)}`,
      { headers: headers(cfg) }
    );
    const state = mapState(res.instance?.state ?? res.state);
    if (state === "connected") {
      return { state, qrCode: null, phoneNumber: null };
    }
    // No conectado: pedir QR (connect también re-inicia la sesión).
    try {
      const qr = await gatewayRequest<EvoConnectResponse>(
        `${base(cfg)}/instance/connect/${encodeURIComponent(cfg.instanceName)}`,
        { headers: headers(cfg) }
      );
      return {
        state: qr.base64 ? "connecting" : state,
        qrCode: toQrDataUrl(qr.base64),
        phoneNumber: null,
      };
    } catch {
      return { state, qrCode: null, phoneNumber: null };
    }
  },

  parseWebhook(body) {
    const payload = body as EvoWebhookBody;
    const event = (payload.event ?? "").toLowerCase().replace(/_/g, ".");
    if (event !== "messages.upsert") return [];

    const items = Array.isArray(payload.data)
      ? payload.data
      : payload.data
        ? [payload.data]
        : [];

    const out: NormalizedInbound[] = [];
    for (const m of items) {
      const jid = m.key?.remoteJid ?? "";
      const id = m.key?.id;
      if (!jid || !id || isGroupJid(jid)) continue;
      out.push({
        from: jidToPhone(jid),
        providerMessageId: id,
        fromMe: m.key?.fromMe ?? false,
        pushName: m.pushName ?? null,
        text: extractText(m),
        timestamp: m.messageTimestamp ?? null,
        type: normalizeType(m.messageType),
        mediaUrl: extractMediaUrl(m),
      });
    }
    return out;
  },

  mediaAuthHeaders(cfg) {
    return { apikey: cfg.apiKey };
  },

  async fetchMediaById(cfg, providerMessageId) {
    const res = await gatewayRequest<{
      base64?: string;
      mimetype?: string;
      mimeType?: string;
    }>(
      `${base(cfg)}/chat/getBase64FromMediaMessage/${encodeURIComponent(cfg.instanceName)}`,
      {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({
          message: { key: { id: providerMessageId } },
          convertToMp4: false,
        }),
        timeoutMs: 30000,
      }
    );
    if (!res.base64) return null;
    // Aceita tanto base64 puro quanto data-URL.
    const raw = res.base64.replace(/^data:[^;]+;base64,/, "");
    return {
      data: Buffer.from(raw, "base64"),
      mimeType: res.mimetype ?? res.mimeType ?? "application/octet-stream",
    };
  },

  async configureWebhook(cfg, webhookUrl) {
    try {
      await gatewayRequest(
        `${base(cfg)}/webhook/set/${encodeURIComponent(cfg.instanceName)}`,
        {
          method: "POST",
          headers: headers(cfg),
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: webhookUrl,
              webhookByEvents: false,
              webhookBase64: false,
              events: ["MESSAGES_UPSERT"],
            },
          }),
        }
      );
      return true;
    } catch {
      // Formato v1 (payload plano) como fallback.
      try {
        await gatewayRequest(
          `${base(cfg)}/webhook/set/${encodeURIComponent(cfg.instanceName)}`,
          {
            method: "POST",
            headers: headers(cfg),
            body: JSON.stringify({
              enabled: true,
              url: webhookUrl,
              events: ["MESSAGES_UPSERT"],
            }),
          }
        );
        return true;
      } catch {
        return false;
      }
    }
  },
};
