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
  phone: string
): Promise<string> {
  const results = await sock.onWhatsApp(`${phone}@s.whatsapp.net`);
  const match = results?.find((r) => r.exists);
  if (!match) {
    throw new BaileysSendError(
      "recipient_not_found",
      "Este número não tem WhatsApp (ou o motor ainda está sincronizando — tente de novo em alguns segundos)"
    );
  }
  return match.jid;
}

/** Envia texto livre pelo motor nativo; devolve o ID da mensagem. */
export async function sendText(
  organizationId: string,
  phone: string,
  text: string
): Promise<string> {
  const sock = getSocket(organizationId);
  const live = await getLiveStatus(organizationId);
  // Não basta existir um socket: ele pode estar "connecting" (pareamento
  // ainda não concluído) — nesse caso `sock.sendMessage` ficaria esperando à toa.
  if (!sock || live.status !== "connected") {
    throw new BaileysSendError(
      "not_connected",
      "Não há WhatsApp Web conectado"
    );
  }

  try {
    const jid = await resolveJid(sock, phone);
    const result = await sock.sendMessage(jid, { text });
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

/** Envia mídia (imagem/documento/áudio/vídeo) pelo motor nativo; devolve o ID da mensagem. */
export async function sendMedia(
  organizationId: string,
  phone: string,
  file: { buffer: Buffer; mimeType: string; filename: string | null; caption?: string }
): Promise<string> {
  const sock = getSocket(organizationId);
  const live = await getLiveStatus(organizationId);
  if (!sock || live.status !== "connected") {
    throw new BaileysSendError(
      "not_connected",
      "Não há WhatsApp Web conectado"
    );
  }

  try {
    const jid = await resolveJid(sock, phone);
    const content = buildBaileysMediaContent(file);
    const result = await sock.sendMessage(jid, content);
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
