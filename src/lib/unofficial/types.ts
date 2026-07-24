/**
 * Capa de adaptadores para gateways de WhatsApp NO oficiales.
 *
 * Cada proveedor (Evolution API, WPPConnect, WAHA) implementa la misma
 * interfaz: enviar texto, consultar estado/QR y normalizar su webhook.
 * Así el resto del CRM no conoce diferencias entre proveedores y agregar
 * uno nuevo es escribir un archivo más.
 */

export type UnofficialProvider = "evolution" | "wppconnect" | "waha";

/** Configuración runtime de un canal (api key ya descifrada). */
export type ChannelConfig = {
  provider: UnofficialProvider;
  baseUrl: string;
  instanceName: string;
  apiKey: string;
};

export type ConnectionState = "connected" | "connecting" | "disconnected";

export type ChannelStatus = {
  state: ConnectionState;
  /** Data-URL (image/png base64) del QR cuando hay que escanear. */
  qrCode: string | null;
  /** Número conectado si el gateway lo expone. */
  phoneNumber: string | null;
};

/** Mensaje entrante (o eco saliente) ya normalizado del webhook. */
export type NormalizedInbound = {
  /** Teléfono del contacto en dígitos (sin @c.us ni sufijos). */
  from: string;
  /** ID del mensaje en el proveedor (se prefija antes de persistir). */
  providerMessageId: string;
  /** true si lo envió el propio número (eco de salida/desde el teléfono). */
  fromMe: boolean;
  pushName: string | null;
  text: string | null;
  /** Epoch en segundos (string o número) o null → ahora. */
  timestamp: string | number | null;
  /** Tipo de contenido normalizado (text, image, audio…). */
  type: string;
};

export interface UnofficialAdapter {
  provider: UnofficialProvider;
  /** Envía texto libre; devuelve el ID del mensaje en el proveedor. */
  sendText(cfg: ChannelConfig, to: string, text: string): Promise<string>;
  /** Estado de la sesión + QR si está pendiente de escanear. */
  getStatus(cfg: ChannelConfig): Promise<ChannelStatus>;
  /** Normaliza el body del webhook a mensajes; ignora eventos ajenos. */
  parseWebhook(body: unknown): NormalizedInbound[];
  /**
   * Best-effort: configura el webhook del gateway apuntando al CRM.
   * Devuelve false si el proveedor no lo soporta vía API (config manual).
   */
  configureWebhook(cfg: ChannelConfig, webhookUrl: string): Promise<boolean>;
}

/** Error tipado del gateway; `status` 0 = red/timeout. */
export class UnofficialApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "UnofficialApiError";
    this.status = status;
  }
}

/** fetch con timeout + errores tipados; JSON in/out. */
export async function gatewayRequest<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 15000, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new UnofficialApiError(
      0,
      `Gateway inaccesible (${err instanceof Error ? err.message : "red"})`
    );
  }
  const raw = await res.text();
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // respuesta no-JSON: se conserva null
  }
  if (!res.ok) {
    const detail =
      typeof data === "object" && data !== null
        ? JSON.stringify(data).slice(0, 300)
        : raw.slice(0, 300);
    throw new UnofficialApiError(
      res.status,
      `Gateway respondió ${res.status}: ${detail}`
    );
  }
  return data as T;
}

/** "5511999999999@c.us" | "...@s.whatsapp.net" → dígitos puros. */
export function jidToPhone(jid: string): string {
  return jid.replace(/@.*$/, "").replace(/[^\d]/g, "");
}

/** true si el JID es de grupo/broadcast (se ignoran en v1). */
export function isGroupJid(jid: string): boolean {
  return jid.includes("@g.us") || jid.includes("@broadcast");
}

/** Garantiza data-URL png para pintar el QR en la UI. */
export function toQrDataUrl(base64: string | null | undefined): string | null {
  if (!base64) return null;
  return base64.startsWith("data:")
    ? base64
    : `data:image/png;base64,${base64}`;
}
