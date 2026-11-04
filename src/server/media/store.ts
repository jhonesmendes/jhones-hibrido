import { existsSync } from "node:fs";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

/**
 * Bytes de mídia das mensagens em ARQUIVO, num volume local da instância
 * (`MEDIA_DIR`) — fora do Postgres. Com mídia no banco, cada foto/áudio
 * inflava o banco (base64, +33%) e entrava inteira em todo `pg_dump`
 * diário; com volume de milhares de mensagens/dia o disco enchia em semanas.
 *
 * Layout: `<MEDIA_DIR>/<organizationId>/<yyyy-mm>/<messageMediaId>` (a
 * pasta do mês facilita apagar/inspecionar por período sem listar milhões
 * de arquivos num diretório só).
 *
 * Fallback: se gravar no disco falhar (disco cheio, volume sem permissão),
 * os bytes vão para `message_media.data_base64` como antes — mídia
 * recebida nunca se perde por causa do armazenamento. O mesmo vale quando,
 * dentro de um container, `MEDIA_DIR` NÃO é um volume montado: gravar ali
 * seria perder tudo no próximo redeploy (compose antigo sem o volume).
 */

/** Ids gerados por nanoid (+ prefixo) — nada que escape da pasta. */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

export function mediaRoot(): string {
  return getEnv().MEDIA_DIR;
}

/** true se `dir` é ponto de montagem (dispositivo diferente do pai). */
export async function isMountPoint(dir: string): Promise<boolean> {
  const [self, parent] = await Promise.all([stat(dir), stat(path.dirname(path.resolve(dir)))]);
  return self.dev !== parent.dev;
}

const globalForStore = globalThis as unknown as { __voceroMediaDirOk?: Promise<boolean> };

/** Disco utilizável para mídia? Fora de container, sempre (dev/self-host
 * sem Docker). Dentro, só se `MEDIA_DIR` for volume — checado uma vez. */
export function mediaDiskAvailable(): Promise<boolean> {
  if (!globalForStore.__voceroMediaDirOk) {
    globalForStore.__voceroMediaDirOk = (async () => {
      if (!existsSync("/.dockerenv")) return true;
      const root = mediaRoot();
      const mounted = await isMountPoint(root).catch(() => false);
      if (!mounted) {
        console.error(
          `[media] ${root} não é um volume montado — a mídia continua no banco até o volume existir (ver docker-compose.yml: vocero_media)`
        );
      }
      return mounted;
    })();
  }
  return globalForStore.__voceroMediaDirOk;
}

export function buildStorageKey(organizationId: string, mediaId: string, at: Date): string {
  if (!SAFE_SEGMENT.test(organizationId) || !SAFE_SEGMENT.test(mediaId)) {
    throw new Error("id inválido para caminho de mídia");
  }
  const month = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${organizationId}/${month}/${mediaId}`;
}

/** Caminho absoluto de uma chave — recusa qualquer chave que saia da raiz. */
export function resolveStorageKey(root: string, key: string): string {
  const base = path.resolve(root);
  const full = path.resolve(base, key);
  if (!full.startsWith(base + path.sep)) throw new Error("chave de mídia fora da raiz");
  return full;
}

/** Grava atomicamente (arquivo temporário + rename): leitura concorrente
 * nunca vê arquivo pela metade. */
export async function writeMediaFile(root: string, key: string, bytes: Buffer): Promise<void> {
  const full = resolveStorageKey(root, key);
  await mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, bytes);
  await rename(tmp, full);
}

export async function readMediaFile(root: string, key: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveStorageKey(root, key));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function deleteMediaFile(root: string, key: string): Promise<void> {
  try {
    await unlink(resolveStorageKey(root, key));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

type StoredBytes = { storageKey: string; dataBase64: null } | { storageKey: null; dataBase64: string };

/** Disco primeiro; se falhar, base64 no banco (nunca perde a mídia). */
export async function storeMediaBytes(
  organizationId: string,
  mediaId: string,
  bytes: Buffer,
  at: Date = new Date()
): Promise<StoredBytes> {
  if (!(await mediaDiskAvailable())) {
    return { storageKey: null, dataBase64: bytes.toString("base64") };
  }
  try {
    const storageKey = buildStorageKey(organizationId, mediaId, at);
    await writeMediaFile(mediaRoot(), storageKey, bytes);
    return { storageKey, dataBase64: null };
  } catch (err) {
    console.error(
      `[media] falha ao gravar mídia ${mediaId} em disco — guardando no banco:`,
      err
    );
    return { storageKey: null, dataBase64: bytes.toString("base64") };
  }
}

/** Bytes de uma linha de `message_media`, venha de onde vier. `null` =
 * apagada pela retenção ou arquivo sumiu do volume. */
export async function readMessageMediaBytes(row: {
  storageKey: string | null;
  dataBase64: string | null;
}): Promise<Buffer | null> {
  if (row.storageKey) return readMediaFile(mediaRoot(), row.storageKey);
  if (row.dataBase64) return Buffer.from(row.dataBase64, "base64");
  return null;
}

/**
 * Único ponto de gravação de `message_media` (recebidas, recuperadas,
 * enviadas). Idempotente por mensagem: se a linha já existia, o arquivo
 * recém-gravado é descartado.
 */
export async function saveMessageMedia(input: {
  organizationId: string;
  messageId: string;
  mimeType: string;
  bytes: Buffer;
  filename?: string | null;
}): Promise<{ sizeBytes: number }> {
  const id = newId("messageMedia");
  const stored = await storeMediaBytes(input.organizationId, id, input.bytes);
  const inserted = await getDb()
    .insert(schema.messageMedia)
    .values({
      id,
      organizationId: input.organizationId,
      messageId: input.messageId,
      mimeType: input.mimeType,
      storageKey: stored.storageKey,
      dataBase64: stored.dataBase64,
      filename: input.filename ?? null,
      sizeBytes: input.bytes.length,
    })
    .onConflictDoNothing({ target: [schema.messageMedia.messageId] })
    .returning({ id: schema.messageMedia.id });
  if (inserted.length === 0 && stored.storageKey) {
    await deleteMediaFile(mediaRoot(), stored.storageKey).catch(() => {});
  }
  return { sizeBytes: input.bytes.length };
}
