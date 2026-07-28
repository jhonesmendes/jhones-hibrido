import type { WASocket, WAMessage, proto } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import { ensureBrNinthDigit } from "@/lib/utils";

const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "sticker"]);

/** Prefijo del ID para que jamás colisione con los `wamid.` de Meta. */
export function baileysMessageId(id: string): string {
  return `unof:baileys:${id}`;
}

function jidToPhone(jid: string): string {
  const raw = jid.replace(/:\d+/, "").replace(/@.*$/, "");
  // WhatsApp es inconsistente sobre qué formato usa para el mismo contacto BR
  // según la vía (JID directo vs. resuelto de un LID) — sin esto, el mismo
  // contacto puede llegar a crear dos conversaciones distintas.
  return ensureBrNinthDigit(raw);
}

function isGroupOrBroadcast(jid: string): boolean {
  return jid.endsWith("@g.us") || jid === "status@broadcast";
}

/**
 * WhatsApp dirige algunos contactos por LID (Linked ID, su capa de
 * privacidad que oculta el número real) en vez del JID clásico
 * `@s.whatsapp.net`. Sin resolverlo al número real, `jidToPhone` extraería
 * el LID crudo (un ID interno de ~15 dígitos) y lo guardaría como si fuera
 * un teléfono — crea un contacto fantasma en vez de actualizar el real. Si
 * el propio Baileys aún no sincronizó el mapeo (pasa recién conectado), se
 * descarta el mensaje en vez de contaminar la base — Baileys resuelve el
 * mapeo solo en poco tiempo y el próximo mensaje del mismo contacto sí
 * entra.
 */
async function resolvePhoneJid(
  sock: WASocket,
  remoteJid: string
): Promise<string | null> {
  if (!remoteJid.endsWith("@lid")) return remoteJid;
  return sock.signalRepository.lidMapping.getPNForLID(remoteJid);
}

function extractText(message: proto.IMessage | null | undefined): string | null {
  if (!message) return null;
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.caption ??
    null
  );
}

function extractType(message: proto.IMessage | null | undefined): string | null {
  if (!message) return null;
  if (message.conversation || message.extendedTextMessage) return "text";
  if (message.imageMessage) return "image";
  if (message.audioMessage) return "audio";
  if (message.videoMessage) return "video";
  if (message.documentMessage) return "document";
  if (message.stickerMessage) return "sticker";
  if (message.locationMessage) return "location";
  return null;
}

function extractMimeType(message: proto.IMessage | null | undefined): string | null {
  if (!message) return null;
  return (
    message.imageMessage?.mimetype ??
    message.videoMessage?.mimetype ??
    message.audioMessage?.mimetype ??
    message.documentMessage?.mimetype ??
    message.stickerMessage?.mimetype ??
    null
  );
}

/**
 * Descarga y descifra la media directo del CDN de WhatsApp (Baileys ya trae
 * la clave de descifrado en el propio mensaje). Autohospedado por
 * constitución (sin S3/R2): se guarda en Postgres como base64, mismo patrón
 * ya usado para el auth-state cifrado.
 */
async function downloadMedia(
  msg: WAMessage
): Promise<{ mimeType: string; dataBase64: string } | null> {
  try {
    const buffer = await downloadMediaMessage(msg, "buffer", {});
    return {
      mimeType: extractMimeType(msg.message) ?? "application/octet-stream",
      dataBase64: buffer.toString("base64"),
    };
  } catch (err) {
    console.error("[baileys] falha ao baixar mídia:", err);
    return null;
  }
}

/** `messageTimestamp` es `number | Long | null` (protobufjs) — sin importar
 * el tipo `Long`, alcanza con duck-typing sobre `toNumber()`. */
function timestampToEpochSeconds(ts: unknown): string {
  if (ts === null || ts === undefined) return "";
  if (typeof ts === "number") return String(ts);
  if (
    typeof ts === "object" &&
    "toNumber" in ts &&
    typeof (ts as { toNumber: unknown }).toNumber === "function"
  ) {
    return String((ts as { toNumber: () => number }).toNumber());
  }
  return "";
}

/**
 * Normaliza los mensajes del evento `messages.upsert` del socket y los
 * ingesta con el mismo pipeline idempotente ya existente (FR-006) — sin
 * webhook, sin adaptador de gateway: la normalización vive acá, una sola vez.
 */
export async function handleIncomingMessages(
  organizationId: string,
  sock: WASocket,
  messages: WAMessage[]
): Promise<void> {
  for (const msg of messages) {
    const rawJid = msg.key.remoteJid;
    if (!rawJid || isGroupOrBroadcast(rawJid)) continue;
    if (!msg.message) continue; // notificación de protocolo, no contenido

    const remoteJid = await resolvePhoneJid(sock, rawJid);
    if (!remoteJid) {
      console.warn(
        `[baileys] LID ${rawJid} sin mapeo de teléfono conocido todavía — mensaje descartado (debería resolver en el próximo)`
      );
      continue;
    }

    const type = extractType(msg.message);
    if (!type) continue; // tipo no soportado (reacción, encuesta, etc.)
    if (!msg.key.id) continue;

    const media = MEDIA_TYPES.has(type) ? await downloadMedia(msg) : null;

    await ingestInboundMessage({
      organizationId,
      from: jidToPhone(remoteJid),
      profileName: msg.key.fromMe ? null : (msg.pushName ?? null),
      waMessageId: baileysMessageId(msg.key.id),
      type,
      text: extractText(msg.message),
      timestamp: timestampToEpochSeconds(msg.messageTimestamp),
      channel: "unofficial",
      fromMe: msg.key.fromMe ?? false,
      mediaUrl: null,
      media,
    });
  }
}
