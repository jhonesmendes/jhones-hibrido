import {
  gatewayRequest,
  isGroupJid,
  jidToPhone,
  toQrDataUrl,
  type ChannelConfig,
  type ChannelStatus,
  type UnofficialAdapter,
} from "@/lib/unofficial/types";

/**
 * Adaptador WPPConnect Server. Docs: wppconnect.io/swagger
 * Auth: Bearer token (generado con el SECRET_KEY del server:
 * POST /api/{session}/{secret}/generate-token — pégalo como API key).
 * Sesión en el path.
 */

function headers(cfg: ChannelConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`,
  };
}

function base(cfg: ChannelConfig): string {
  return `${cfg.baseUrl.replace(/\/+$/, "")}/api/${encodeURIComponent(cfg.instanceName)}`;
}

type WppSendResponse = {
  response?: { id?: string | { id?: string; _serialized?: string } }[];
  id?: string;
};

type WppStatusResponse = {
  status?: string;
  qrcode?: string;
  urlcode?: string;
};

type WppWebhookBody = {
  event?: string;
  session?: string;
  id?: string | { id?: string; _serialized?: string };
  from?: string;
  fromMe?: boolean;
  body?: string;
  caption?: string;
  type?: string;
  timestamp?: number | string;
  t?: number;
  sender?: { pushname?: string };
  isGroupMsg?: boolean;
};

function extractId(
  id: string | { id?: string; _serialized?: string } | undefined
): string | null {
  if (!id) return null;
  if (typeof id === "string") return id;
  return id._serialized ?? id.id ?? null;
}

function normalizeType(type: string | undefined): string {
  switch (type) {
    case "chat":
    case undefined:
      return "text";
    case "image":
    case "audio":
    case "video":
    case "document":
    case "sticker":
    case "location":
      return type;
    case "ptt":
      return "audio";
    case "vcard":
    case "multi_vcard":
      return "contacts";
    default:
      return "text";
  }
}

function mapStatus(status: string | undefined): ChannelStatus["state"] {
  switch ((status ?? "").toUpperCase()) {
    case "CONNECTED":
    case "INCHAT":
      return "connected";
    case "QRCODE":
    case "INITIALIZING":
    case "OPENING":
    case "PAIRING":
      return "connecting";
    default:
      return "disconnected";
  }
}

export const wppconnectAdapter: UnofficialAdapter = {
  provider: "wppconnect",

  async sendText(cfg, to, text) {
    const res = await gatewayRequest<WppSendResponse>(
      `${base(cfg)}/send-message`,
      {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({ phone: to, message: text, isGroup: false }),
      }
    );
    return (
      extractId(res.response?.[0]?.id) ?? res.id ?? `wpp-${Date.now()}`
    );
  },

  async getStatus(cfg) {
    const res = await gatewayRequest<WppStatusResponse>(
      `${base(cfg)}/status-session`,
      { headers: headers(cfg) }
    );
    const state = mapStatus(res.status);
    let qr = toQrDataUrl(res.qrcode);
    if (state !== "connected" && !qr) {
      // Algunas versiones solo devuelven el QR al iniciar la sesión.
      try {
        const started = await gatewayRequest<WppStatusResponse>(
          `${base(cfg)}/start-session`,
          {
            method: "POST",
            headers: headers(cfg),
            body: JSON.stringify({ waitQrCode: true }),
          }
        );
        qr = toQrDataUrl(started.qrcode);
      } catch {
        // best-effort
      }
    }
    return { state, qrCode: state === "connected" ? null : qr, phoneNumber: null };
  },

  parseWebhook(body) {
    const payload = body as WppWebhookBody;
    if ((payload.event ?? "") !== "onmessage") return [];
    const from = payload.from ?? "";
    const id = extractId(payload.id);
    if (!from || !id || payload.isGroupMsg || isGroupJid(from)) return [];
    return [
      {
        from: jidToPhone(from),
        providerMessageId: id,
        fromMe: payload.fromMe ?? false,
        pushName: payload.sender?.pushname ?? null,
        text: payload.body ?? payload.caption ?? null,
        timestamp: payload.timestamp ?? payload.t ?? null,
        type: normalizeType(payload.type),
      },
    ];
  },

  mediaAuthHeaders(cfg) {
    return { Authorization: `Bearer ${cfg.apiKey}` };
  },

  async fetchMediaById(cfg, providerMessageId) {
    // GET /api/{session}/get-media-by-message/{id} → base64 (formato varia
    // por versão do wppconnect-server; extração robusta).
    const res = await gatewayRequest<
      { base64?: string; mimetype?: string } | string
    >(
      `${base(cfg)}/get-media-by-message/${encodeURIComponent(providerMessageId)}`,
      { headers: headers(cfg), timeoutMs: 30000 }
    );
    const b64 =
      typeof res === "string" ? res : (res?.base64 ?? null);
    if (!b64) return null;
    const match = /^data:([^;]+);base64,(.*)$/.exec(b64);
    return {
      data: Buffer.from(match ? match[2]! : b64, "base64"),
      mimeType:
        (match ? match[1] : null) ??
        (typeof res === "object" ? (res.mimetype ?? null) : null) ??
        "application/octet-stream",
    };
  },

  async configureWebhook() {
    // WPPConnect define el webhook en la config del server
    // (config.json / env WEBHOOK_URL): no hay endpoint por sesión.
    return false;
  },
};
