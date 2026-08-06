import type { WASocket, WAMessage, proto } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import { refreshContactAvatar } from "@/server/baileys/avatar";
import { ensureBrNinthDigit } from "@/lib/utils";

const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "sticker"]);

/** Prefixo do ID para que nunca colida com os `wamid.` da Meta. */
export function baileysMessageId(id: string): string {
  return `unof:baileys:${id}`;
}

/** Inverso de `baileysMessageId` — devolve o ID cru que o Baileys entende
 * (ex.: pra citar/responder uma mensagem ao enviar). `null` se não for um
 * `wa_message_id` deste canal (ex.: veio do canal oficial). */
export function rawBaileysId(waMessageId: string): string | null {
  const prefix = "unof:baileys:";
  return waMessageId.startsWith(prefix) ? waMessageId.slice(prefix.length) : null;
}

function jidToPhone(jid: string): string {
  const raw = jid.replace(/:\d+/, "").replace(/@.*$/, "");
  // O WhatsApp é inconsistente sobre qual formato usa pro mesmo contato BR
  // dependendo da via (JID direto vs. resolvido de um LID) — sem isso, o
  // mesmo contato pode acabar criando duas conversas distintas.
  return ensureBrNinthDigit(raw);
}

function isGroupJid(jid: string): boolean {
  return jid.endsWith("@g.us");
}

function isBroadcast(jid: string): boolean {
  return jid === "status@broadcast";
}

/** ID numérico do grupo, sem o sufixo `@g.us` — vira `contact.phone` (a
 * Cloud API oficial não tem conceito de grupo, então isso só existe no
 * canal não oficial). */
function groupJidToId(jid: string): string {
  return jid.replace(/@g\.us$/, "");
}

/**
 * `sock.groupMetadata` consulta o WhatsApp a cada chamada — sem cache, um
 * grupo movimentado martelaria o servidor a cada mensagem. Só é preciso no
 * momento em que o grupo (contato) é criado pela primeira vez; depois disso
 * o nome já está salvo e some da conversa quando alguém o edita é aceitável
 * (mesmo comportamento do nome de um contato individual sincronizado 1x).
 */
async function fetchGroupName(
  sock: WASocket,
  groupJid: string
): Promise<string | null> {
  try {
    const meta = await sock.groupMetadata(groupJid);
    return meta.subject || null;
  } catch (err) {
    console.error("[baileys] falha ao buscar nome do grupo:", err);
    return null;
  }
}

const groupNameCache = new Map<string, { name: string | null; at: number }>();
const GROUP_NAME_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function getGroupName(sock: WASocket, groupJid: string): Promise<string | null> {
  const cached = groupNameCache.get(groupJid);
  if (cached && Date.now() - cached.at < GROUP_NAME_CACHE_TTL_MS) return cached.name;
  const name = await fetchGroupName(sock, groupJid);
  groupNameCache.set(groupJid, { name, at: Date.now() });
  return name;
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

/** Resume um cartão de contato (vCard) compartilhado — sem isso a mensagem
 * fica sem texto nenhum pra mostrar (não há mídia baixável aqui). */
function formatVcardContact(
  displayName: string | null | undefined,
  vcard: string | null | undefined
): string | null {
  const name = displayName?.trim() || null;
  const phone = vcard?.match(/TEL[^:]*:(.+)/)?.[1]?.trim() || null;
  if (name && phone) return `${name} — ${phone}`;
  return name ?? phone;
}

function extractContactsSummary(
  message: proto.IMessage | null | undefined
): string | null {
  if (message?.contactMessage) {
    return formatVcardContact(
      message.contactMessage.displayName,
      message.contactMessage.vcard
    );
  }
  if (message?.contactsArrayMessage) {
    const names = (message.contactsArrayMessage.contacts ?? [])
      .map((c) => c.displayName)
      .filter((n): n is string => Boolean(n?.trim()));
    if (names.length > 0) return names.join(", ");
    return message.contactsArrayMessage.displayName ?? null;
  }
  return null;
}

function extractText(message: proto.IMessage | null | undefined): string | null {
  if (!message) return null;
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.caption ??
    extractContactsSummary(message)
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
  if (message.contactMessage || message.contactsArrayMessage) return "contacts";
  return null;
}

/** `wa_message_id` cru da mensagem citada (resposta), quando existe —
 * `contextInfo.stanzaId` vive em local diferente por tipo de mensagem no
 * proto do Baileys, não existe um campo único. */
function extractQuotedStanzaId(message: proto.IMessage | null | undefined): string | null {
  if (!message) return null;
  return (
    message.extendedTextMessage?.contextInfo?.stanzaId ??
    message.imageMessage?.contextInfo?.stanzaId ??
    message.videoMessage?.contextInfo?.stanzaId ??
    message.audioMessage?.contextInfo?.stanzaId ??
    message.documentMessage?.contextInfo?.stanzaId ??
    message.stickerMessage?.contextInfo?.stanzaId ??
    null
  );
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
): Promise<{ mimeType: string; dataBase64: string; filename: string | null } | null> {
  try {
    const buffer = await downloadMediaMessage(msg, "buffer", {});
    return {
      mimeType: extractMimeType(msg.message) ?? "application/octet-stream",
      dataBase64: buffer.toString("base64"),
      filename: msg.message?.documentMessage?.fileName ?? null,
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
  channelId: string,
  sock: WASocket,
  messages: WAMessage[]
): Promise<void> {
  for (const msg of messages) {
    const rawJid = msg.key.remoteJid;
    if (!rawJid || isBroadcast(rawJid)) continue;
    if (!msg.message) continue; // notificação de protocolo, sem conteúdo

    const isGroup = isGroupJid(rawJid);
    // Num grupo o remetente real é `participant`; `remoteJid` é a thread
    // (o grupo) em si — resolver LID só faz sentido no caso individual.
    const remoteJid = isGroup ? rawJid : await resolvePhoneJid(sock, rawJid);
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
    const text = extractText(msg.message);
    const fromMe = msg.key.fromMe ?? false;
    const quotedStanzaId = extractQuotedStanzaId(msg.message);

    // Prefixa com quem falou dentro do grupo — sem isso, o operador vê só
    // "mensagem" sem saber qual dos participantes escreveu.
    const senderName = isGroup && !fromMe ? (msg.pushName ?? null) : null;
    const displayText = senderName && text ? `*${senderName}:* ${text}` : text;

    await ingestInboundMessage({
      organizationId,
      unofficialChannelId: channelId,
      from: isGroup ? groupJidToId(rawJid) : jidToPhone(remoteJid),
      profileName: isGroup
        ? await getGroupName(sock, rawJid)
        : fromMe
          ? null
          : (msg.pushName ?? null),
      waMessageId: baileysMessageId(msg.key.id),
      type,
      text: displayText,
      timestamp: timestampToEpochSeconds(msg.messageTimestamp),
      channel: "unofficial",
      fromMe,
      mediaUrl: null,
      media,
      contactKind: isGroup ? "group" : "individual",
      replyToWaMessageId: quotedStanzaId ? baileysMessageId(quotedStanzaId) : null,
    });

    if (!fromMe) {
      const avatarJid = isGroup ? rawJid : remoteJid;
      const avatarPhone = isGroup ? groupJidToId(rawJid) : jidToPhone(remoteJid);
      void refreshContactAvatar(organizationId, sock, avatarJid, avatarPhone).catch(
        (err) => console.error("[baileys] falha ao buscar foto de perfil:", err)
      );
    }
  }
}
