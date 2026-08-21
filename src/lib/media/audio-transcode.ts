import { spawn } from "node:child_process";

/**
 * Tipos de áudio que a Cloud API da Meta aceita no upload de mídia (erro
 * #100 do Graph API se vier fora dessa lista). `MediaRecorder` no browser
 * grava por padrão em `audio/webm` (Chrome/Edge/Firefox) — não está nessa
 * lista, então todo áudio gravado no app precisa passar por aqui antes do
 * upload (tanto envio direto quanto encaminhamento, já que os dois passam
 * por `sendMedia`).
 */
const META_COMPATIBLE_AUDIO_MIME_TYPES = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/amr",
  "audio/ogg",
  "audio/opus",
]);

/**
 * Garante que um áudio esteja num formato aceito pela Meta, convertendo via
 * ffmpeg (precisa estar no PATH — instalado na imagem Docker via `apk add
 * ffmpeg`) quando necessário. Se o ffmpeg não estiver disponível (dev local
 * sem ele instalado) ou a conversão falhar, devolve o buffer original sem
 * quebrar o fluxo — o upload vai falhar do mesmo jeito que falharia sem essa
 * função, só não trava o envio de outros tipos de mídia.
 */
export async function ensureMetaCompatibleAudio(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const base = (mimeType.split(";")[0] ?? mimeType).trim().toLowerCase();
  if (!base.startsWith("audio/") || META_COMPATIBLE_AUDIO_MIME_TYPES.has(base)) {
    return { buffer, mimeType: base || mimeType };
  }

  try {
    const converted = await transcodeToOggOpus(buffer);
    return { buffer: converted, mimeType: "audio/ogg" };
  } catch (err) {
    console.error(`[media] falha ao converter áudio ${base} para ogg/opus:`, err);
    return { buffer, mimeType };
  }
}

function transcodeToOggOpus(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-vn",
      "-c:a",
      "libopus",
      "-f",
      "ogg",
      "pipe:1",
    ]);

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    ff.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    ff.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(out));
      } else {
        reject(new Error(`ffmpeg saiu com código ${code}: ${Buffer.concat(err).toString("utf8")}`));
      }
    });

    ff.stdin.write(input);
    ff.stdin.end();
  });
}
