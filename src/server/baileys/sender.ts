import type { WAMessage } from "@whiskeysockets/baileys";
import { getLiveStatus, getSocket } from "@/server/baileys/manager";

export class BaileysSendError extends Error {
  code: "not_connected" | "recipient_not_found" | "send_failed";
  constructor(code: BaileysSendError["code"], message: string) {
    super(message);
    this.name = "BaileysSendError";
    this.code = code;
  }
}

/**
 * Resolve o JID real do destinatário contra os servidores do WhatsApp
 * (`onWhatsApp`) em vez de assumir `${phone}@s.whatsapp.net` às cegas. Isso
 * é necessário porque o WhatsApp resolve do lado do servidor casos em que o
 * número salvo não coincide byte a byte com o JID registrado (por exemplo o
 * "nono dígito" dos celulares do Brasil) — enviar ao JID cru nesses
 * casos falha em silêncio (o Baileys não lança erro; a mensagem simplesmente
 * nunca chega). Se o número não existir no WhatsApp, falha de forma
 * explícita em vez de fingir um envio bem-sucedido.
 */
async function resolveJid(
  sock: NonNullable<ReturnType<typeof getSocket>>,
  target: string
): Promise<string> {
  // Grupo: o JID já é exato (vem do próprio contato) — `onWhatsApp` é uma
  // busca de número individual, não existe equivalente pra grupo.
  if (target.endsWith("@g.us")) return target;

  const results = await sock.onWhatsApp(`${target}@s.whatsapp.net`);
  const match = results?.find((r) => r.exists);
  if (!match) {
    throw new BaileysSendError(
      "recipient_not_found",
      "Este número não tem WhatsApp (ou o motor ainda está sincronizando — tente de novo em alguns segundos)"
    );
  }
  return match.jid;
}

/** Mínimo necessário pro Baileys renderizar "respondendo a: ..." no
 * destinatário — não precisamos guardar o proto bruto da mensagem original,
 * só reconstruir esse tanto a partir do que já temos no banco. */
export type QuotedMessage = {
  /** ID cru do Baileys (sem o prefixo `unof:baileys:` usado no nosso banco). */
  waMessageId: string;
  fromMe: boolean;
  text: string | null;
};

/** `remoteJid` vem do `jid` já resolvido pra esse envio (mesmo destinatário
 * da mensagem em si) — sem precisar resolver de novo nem guardar à parte. */
function toBaileysQuoted(jid: string, quoted?: QuotedMessage): WAMessage | undefined {
  if (!quoted) return undefined;
  return {
    key: { remoteJid: jid, id: quoted.waMessageId, fromMe: quoted.fromMe },
    message: { conversation: quoted.text ?? "" },
  } as WAMessage;
}

/** Envia texto livre pelo motor nativo; devolve o ID da mensagem.
 * `target` é um telefone (individual) ou um JID de grupo (`...@g.us`). */
export async function sendText(
  channelId: string,
  target: string,
  text: string,
  quoted?: QuotedMessage
): Promise<string> {
  const sock = getSocket(channelId);
  const live = await getLiveStatus(channelId);
  // Não basta existir um socket: ele pode estar "connecting" (pareamento
  // ainda não concluído) — nesse caso `sock.sendMessage` ficaria esperando à toa.
  if (!sock || live.status !== "connected") {
    throw new BaileysSendError(
      "not_connected",
      "Não há WhatsApp Web conectado"
    );
  }

  try {
    const jid = await resolveJid(sock, target);
    const quotedMsg = toBaileysQuoted(jid, quoted);
    const result = await sock.sendMessage(
      jid,
      { text },
      quotedMsg ? { quoted: quotedMsg } : undefined
    );
    if (!result?.key.id) {
      throw new BaileysSendError(
        "send_failed",
        "O WhatsApp não devolveu o ID da mensagem"
      );
    }
    return result.key.id;
  } catch (err) {
    if (err instanceof BaileysSendError) throw err;
    throw new BaileysSendError(
      "send_failed",
      err instanceof Error ? err.message : "Falha ao enviar a mensagem"
    );
  }
}

/** Envia mídia (imagem/documento/áudio/vídeo) pelo motor nativo; devolve o ID da mensagem.
 * `target` é um telefone (individual) ou um JID de grupo (`...@g.us`). */
export async function sendMedia(
  channelId: string,
  target: string,
  file: { buffer: Buffer; mimeType: string; filename: string | null; caption?: string },
  quoted?: QuotedMessage
): Promise<string> {
  const sock = getSocket(channelId);
  const live = await getLiveStatus(channelId);
  if (!sock || live.status !== "connected") {
    throw new BaileysSendError(
      "not_connected",
      "Não há WhatsApp Web conectado"
    );
  }

  try {
    const jid = await resolveJid(sock, target);
    const content = buildBaileysMediaContent(file);
    const quotedMsg = toBaileysQuoted(jid, quoted);
    const result = await sock.sendMessage(
      jid,
      content,
      quotedMsg ? { quoted: quotedMsg } : undefined
    );
    if (!result?.key.id) {
      throw new BaileysSendError(
        "send_failed",
        "O WhatsApp não devolveu o ID da mensagem"
      );
    }
    return result.key.id;
  } catch (err) {
    if (err instanceof BaileysSendError) throw err;
    throw new BaileysSendError(
      "send_failed",
      err instanceof Error ? err.message : "Falha ao enviar a mídia"
    );
  }
}

type BaileysMediaContent =
  | { image: Buffer; caption?: string }
  | { video: Buffer; caption?: string }
  | { audio: Buffer; mimetype: string }
  | { document: Buffer; mimetype: string; fileName: string; caption?: string };

function buildBaileysMediaContent(file: {
  buffer: Buffer;
  mimeType: string;
  filename: string | null;
  caption?: string;
}): BaileysMediaContent {
  if (file.mimeType.startsWith("image/")) {
    return { image: file.buffer, caption: file.caption };
  }
  if (file.mimeType.startsWith("video/")) {
    return { video: file.buffer, caption: file.caption };
  }
  if (file.mimeType.startsWith("audio/")) {
    return { audio: file.buffer, mimetype: file.mimeType };
  }
  return {
    document: file.buffer,
    mimetype: file.mimeType,
    fileName: file.filename ?? "arquivo",
    caption: file.caption,
  };
}
