import type { WASocket, WAMessage, proto } from "@whiskeysockets/baileys";
import {
  BufferJSON,
  downloadMediaMessage,
  normalizeMessageContent,
} from "@whiskeysockets/baileys";

/**
 * Download de mídia do canal não oficial — isolado de `inbound.ts` pra
 * recuperação posterior (`server/inbox/media-recovery.ts`) reusar sem
 * import circular (inbound → ingest → media-recovery).
 */

export type BaileysMedia = { mimeType: string; dataBase64: string; filename: string | null };

/** Desembrulha ephemeral/viewOnce/documentWithCaption/etc. — sem isso,
 * documento com legenda, mensagem temporária e visualização única não
 * casam com nenhum tipo e são descartados. */
export function unwrapMessage(
  message: proto.IMessage | null | undefined
): proto.IMessage | undefined {
  return normalizeMessageContent(message);
}

function extractMimeType(message: proto.IMessage | undefined): string | null {
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: timeout após ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Baixa e descriptografa a mídia direto do CDN do WhatsApp (o Baileys já
 * traz a chave de descriptografia na própria mensagem).
 *
 * `reupload`: mídia ENCAMINHADA reaproveita a URL do CDN do envio
 * original, que costuma já ter expirado (404/410) — aí o Baileys pede ao
 * celular pra reenviar. Esse pedido NÃO tem timeout no Baileys (fica
 * pendurado se o celular não responde), por isso o `timeoutMs` aqui é
 * obrigatório: um download preso nunca pode segurar a ingestão.
 */
export async function downloadBaileysMedia(
  sock: WASocket,
  msg: WAMessage,
  opts: { reupload: boolean; timeoutMs: number }
): Promise<BaileysMedia> {
  const ctx = opts.reupload
    ? { logger: sock.logger, reuploadRequest: sock.updateMediaMessage }
    : undefined;
  const buffer = await withTimeout(
    downloadMediaMessage(msg, "buffer", {}, ctx),
    opts.timeoutMs,
    "download de mídia"
  );
  const content = unwrapMessage(msg.message);
  return {
    mimeType: extractMimeType(content) ?? "application/octet-stream",
    dataBase64: buffer.toString("base64"),
    filename: content?.documentMessage?.fileName ?? null,
  };
}

/** Só o necessário pro download (chave + conteúdo com mediaKey/directPath),
 * em JSON com os Buffers preservados. */
export function serializeMediaSource(msg: WAMessage): string {
  return JSON.stringify({ key: msg.key, message: msg.message }, BufferJSON.replacer);
}

export function deserializeMediaSource(raw: string): WAMessage {
  return JSON.parse(raw, BufferJSON.reviver) as WAMessage;
}
