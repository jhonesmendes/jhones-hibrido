import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Autenticação em duas camadas do webhook (contrato webhook.md / DV-VC-02).
 * Este módulo é puro (sem BD) para poder ser testado unitariamente.
 */

/** Comparação timing-safe de strings de comprimento arbitrário. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Camada 1: o segmento da rota deve coincidir com o verify token. */
export function isValidWebhookToken(
  segment: string,
  verifyToken: string
): boolean {
  return verifyToken.length > 0 && safeEqual(segment, verifyToken);
}

/**
 * Camada 2 (opcional): assinatura HMAC-SHA256 da Meta sobre o body BRUTO.
 * Retorna true se não houver segredo configurado (camada desativada).
 */
export function isValidSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined
): boolean {
  if (!appSecret) return true;
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  return safeEqual(signatureHeader.slice("sha256=".length), expected);
}

/* ---------- Tipos do payload da Meta (subconjunto suportado) ---------- */

export type WebhookMedia = {
  id: string;
  mime_type?: string;
  filename?: string;
  caption?: string;
};

export type WebhookMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: WebhookMedia;
  document?: WebhookMedia;
  audio?: WebhookMedia;
  video?: WebhookMedia;
  sticker?: WebhookMedia;
};

export type WebhookStatus = {
  id: string;
  status: string;
  timestamp: string;
  recipient_id?: string;
  errors?: { code: number; title?: string; message?: string }[];
};

export type WebhookValue = {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: WebhookMessage[];
  statuses?: WebhookStatus[];
  // message_template_status_update
  event?: string;
  message_template_name?: string;
  message_template_language?: string;
  message_template_id?: number | string;
  reason?: string | null;
};

export type WebhookChange = { field?: string; value?: WebhookValue };

export type WebhookPayload = {
  object?: string;
  entry?: { id?: string; changes?: WebhookChange[] }[];
};
