import type { WASocket, WAMessage, proto } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import { ensureBrNinthDigit } from "@/lib/utils";

const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "sticker"]);

/** Prefixo do ID para que nunca colida com os `wamid.` da Meta. */
export function baileysMessageId(id: string): string {
  return `unof:baileys:${id}`;
}

function jidToPhone(jid: string): string {
  const raw = jid.replace(/:\d+/, "").replace(/@.*$/, "");
  // O WhatsApp é inconsistente sobre qual formato usa pro mesmo contato BR
  // dependendo da via (JID direto vs. resolvido de um LID) — sem isso, o
  // mesmo contato pode acabar criando duas conversas distintas.
  return ensureBrNinthDigit(raw);
}

function isGroupOrBroadcast(jid: string): boolean {
  return jid.endsWith("@g.us") || jid === "status@broadcast";
}

/**
 * O WhatsApp direciona alguns contatos por LID (Linked ID, sua camada de
 * privacidade que oculta o número real) em vez do JID clássico
 * `@s.whatsapp.net`. Sem resolvê-lo para o número real, `jidToPhone`
 * extrairia o LID cru (um ID interno de ~15 dígitos) e o salvaria como se
 * fosse um telefone — cria um contato fantasma em vez de atualizar o real.
 * Se o próprio Baileys ainda não sincronizou o mapeamento (acontece logo
 * após conectar), a mensagem é descartada em vez de contaminar a base — o
 * Baileys resolve o mapeamento sozinho em pouco tempo e a próxima mensagem
 * do mesmo contato entra normalmente.
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
 * Baixa e descriptografa a mídia direto do CDN do WhatsApp (o Baileys já
 * traz a chave de descriptografia na própria mensagem). Autohospedado por
 * constituição (sem S3/R2): é salvo no Postgres como base64, mesmo padrão
 * já usado para o auth-state cifrado.
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

/** `messageTimestamp` é `number | Long | null` (protobufjs) — sem importar
 * o tipo `Long`, basta duck-typing sobre `toNumber()`. */
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
 * Normaliza as mensagens do evento `messages.upsert` do socket e as ingere
 * com o mesmo pipeline idempotente já existente (FR-006) — sem webhook, sem
 * adaptador de gateway: a normalização vive aqui, uma única vez.
 */
export async function handleIncomingMessages(
  organizationId: string,
  sock: WASocket,
  messages: WAMessage[]
): Promise<void> {
  for (const msg of messages) {
    const rawJid = msg.key.remoteJid;
    if (!rawJid || isGroupOrBroadcast(rawJid)) continue;
    if (!msg.message) continue; // notificação de protocolo, sem conteúdo

    const remoteJid = await resolvePhoneJid(sock, rawJid);
    if (!remoteJid) {
      console.warn(
        `[baileys] LID ${rawJid} sem mapeamento de telefone conhecido ainda — mensagem descartada (deve resolver na próxima)`
      );
      continue;
    }

    const type = extractType(msg.message);
    if (!type) continue; // tipo não suportado (reação, enquete, etc.)
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
