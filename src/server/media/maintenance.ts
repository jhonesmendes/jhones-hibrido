import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  buildStorageKey,
  deleteMediaFile,
  mediaDiskAvailable,
  mediaRoot,
  writeMediaFile,
} from "@/server/media/store";

/**
 * Manutenção do armazenamento de mídia, em segundo plano:
 * 1. migra a mídia legada (base64 no Postgres) para arquivo, em lotes;
 * 2. aplica a retenção por organização (`media_config.retentionDays`);
 * 3. apaga arquivos órfãos — mensagem/contato/organização excluídos
 *    removem a linha por cascade, mas o arquivo ficava para trás.
 */

const TICK_MS = 5 * 60_000;
const SWEEP_INTERVAL_MS = 24 * 60 * 60_000;
const LEGACY_BATCH = 25;
const PURGE_BATCH = 500;
/** Arquivo recém-gravado pode ainda não ter a linha no banco (grava o
 * arquivo antes do INSERT) — a limpeza só toca arquivos mais velhos. */
const ORPHAN_MIN_AGE_MS = 60 * 60_000;

export const MIN_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 3650;

export function retentionCutoff(retentionDays: number, now: Date): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60_000);
}

export type MediaConfig = { retentionDays: number | null };

export async function getMediaConfig(organizationId: string): Promise<MediaConfig> {
  const rows = await getDb()
    .select({ retentionDays: schema.mediaConfig.retentionDays })
    .from(schema.mediaConfig)
    .where(eq(schema.mediaConfig.organizationId, organizationId))
    .limit(1);
  return { retentionDays: rows[0]?.retentionDays ?? null };
}

export async function saveMediaConfig(organizationId: string, config: MediaConfig): Promise<void> {
  await getDb()
    .insert(schema.mediaConfig)
    .values({ organizationId, retentionDays: config.retentionDays })
    .onConflictDoUpdate({
      target: schema.mediaConfig.organizationId,
      set: { retentionDays: config.retentionDays, updatedAt: new Date() },
    });
}

export type MediaUsage = {
  onDiskCount: number;
  onDiskBytes: number;
  /** Ainda no banco: legadas aguardando migração ou fallback de disco. */
  inDatabaseCount: number;
  inDatabaseBytes: number;
  purgedCount: number;
  oldestStoredAt: string | null;
};

export async function getMediaUsage(organizationId: string): Promise<MediaUsage> {
  const t = schema.messageMedia;
  const rows = await getDb()
    .select({
      onDiskCount: sql<number>`count(*) filter (where ${t.storageKey} is not null)::int`,
      onDiskBytes: sql<number>`coalesce(sum(${t.sizeBytes}) filter (where ${t.storageKey} is not null), 0)::bigint`,
      inDatabaseCount: sql<number>`count(*) filter (where ${t.dataBase64} is not null)::int`,
      inDatabaseBytes: sql<number>`coalesce(sum(${t.sizeBytes}) filter (where ${t.dataBase64} is not null), 0)::bigint`,
      purgedCount: sql<number>`count(*) filter (where ${t.purgedAt} is not null)::int`,
      oldestStoredAt: sql<Date | null>`min(${t.createdAt}) filter (where ${t.purgedAt} is null)`,
    })
    .from(t)
    .where(eq(t.organizationId, organizationId));
  const r = rows[0];
  return {
    onDiskCount: Number(r?.onDiskCount ?? 0),
    onDiskBytes: Number(r?.onDiskBytes ?? 0),
    inDatabaseCount: Number(r?.inDatabaseCount ?? 0),
    inDatabaseBytes: Number(r?.inDatabaseBytes ?? 0),
    purgedCount: Number(r?.purgedCount ?? 0),
    oldestStoredAt: r?.oldestStoredAt ? new Date(r.oldestStoredAt).toISOString() : null,
  };
}

/** Move um lote de mídia legada do banco para o disco. Devolve quantas
 * moveu; 0 = acabou (ou o disco está falhando — tenta no próximo ciclo). */
export async function migrateLegacyMediaBatch(limit = LEGACY_BATCH): Promise<number> {
  if (!(await mediaDiskAvailable())) return 0;
  const db = getDb();
  const t = schema.messageMedia;
  const rows = await db
    .select({
      id: t.id,
      organizationId: t.organizationId,
      createdAt: t.createdAt,
      dataBase64: t.dataBase64,
    })
    .from(t)
    .where(and(isNotNull(t.dataBase64), isNull(t.storageKey), isNull(t.purgedAt)))
    .limit(limit);

  let moved = 0;
  for (const row of rows) {
    if (!row.dataBase64) continue;
    const bytes = Buffer.from(row.dataBase64, "base64");
    let key: string;
    try {
      key = buildStorageKey(row.organizationId, row.id, row.createdAt);
      await writeMediaFile(mediaRoot(), key, bytes);
    } catch (err) {
      console.error(`[media] migração: falha ao gravar ${row.id} em disco:`, err);
      return moved;
    }
    const updated = await db
      .update(t)
      .set({ storageKey: key, dataBase64: null, sizeBytes: bytes.length })
      .where(and(eq(t.id, row.id), isNull(t.storageKey)))
      .returning({ id: t.id });
    if (updated.length === 0) await deleteMediaFile(mediaRoot(), key).catch(() => {});
    else moved++;
  }
  return moved;
}

/** Apaga os bytes de mídias além da retenção de cada organização. */
export async function purgeExpiredMedia(now: Date = new Date()): Promise<number> {
  const db = getDb();
  const t = schema.messageMedia;
  const configs = await db
    .select()
    .from(schema.mediaConfig)
    .where(isNotNull(schema.mediaConfig.retentionDays));

  let purged = 0;
  for (const config of configs) {
    if (config.retentionDays === null) continue;
    const cutoff = retentionCutoff(config.retentionDays, now);
    for (;;) {
      const rows = await db
        .select({ id: t.id, storageKey: t.storageKey })
        .from(t)
        .where(
          and(
            eq(t.organizationId, config.organizationId),
            lt(t.createdAt, cutoff),
            isNull(t.purgedAt)
          )
        )
        .limit(PURGE_BATCH);
      if (rows.length === 0) break;
      for (const row of rows) {
        if (row.storageKey) await deleteMediaFile(mediaRoot(), row.storageKey);
      }
      await db
        .update(t)
        .set({ purgedAt: now, storageKey: null, dataBase64: null })
        .where(inArray(t.id, rows.map((r) => r.id)));
      purged += rows.length;
      if (rows.length < PURGE_BATCH) break;
    }
  }
  if (purged > 0) console.info(`[media] retenção: ${purged} mídia(s) apagada(s)`);
  return purged;
}

/** Apaga arquivos do volume que nenhuma linha de `message_media` aponta. */
export async function sweepOrphanFiles(now: Date = new Date()): Promise<number> {
  const root = mediaRoot();
  const db = getDb();
  let removed = 0;
  const orgDirs = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const orgDir of orgDirs) {
    if (!orgDir.isDirectory()) continue;
    const monthDirs = await readdir(path.join(root, orgDir.name), { withFileTypes: true });
    for (const monthDir of monthDirs) {
      if (!monthDir.isDirectory()) continue;
      const prefix = `${orgDir.name}/${monthDir.name}`;
      const names = await readdir(path.join(root, prefix));
      for (let i = 0; i < names.length; i += 500) {
        const chunk = names.slice(i, i + 500);
        const keys = chunk.map((n) => `${prefix}/${n}`);
        const known = await db
          .select({ key: schema.messageMedia.storageKey })
          .from(schema.messageMedia)
          .where(inArray(schema.messageMedia.storageKey, keys));
        const knownSet = new Set(known.map((k) => k.key));
        for (const key of keys) {
          if (knownSet.has(key)) continue;
          const info = await stat(path.join(root, key)).catch(() => null);
          if (!info?.isFile() || now.getTime() - info.mtimeMs < ORPHAN_MIN_AGE_MS) continue;
          await deleteMediaFile(root, key);
          removed++;
        }
      }
    }
  }
  if (removed > 0) console.info(`[media] limpeza: ${removed} arquivo(s) órfão(s) apagado(s)`);
  return removed;
}

const globalForMedia = globalThis as unknown as {
  __voceroMediaMaintenanceTimer?: NodeJS.Timeout;
  __voceroMediaMaintenanceRunning?: boolean;
  __voceroMediaLastSweepAt?: number;
};

export async function runMediaMaintenance(now: Date = new Date()): Promise<void> {
  if (globalForMedia.__voceroMediaMaintenanceRunning) return;
  globalForMedia.__voceroMediaMaintenanceRunning = true;
  try {
    // Migração em lotes até esvaziar — cada lote é curto, o processo
    // continua atendendo requisições entre um e outro.
    let total = 0;
    for (;;) {
      const moved = await migrateLegacyMediaBatch();
      total += moved;
      if (moved < LEGACY_BATCH) break;
    }
    if (total > 0) console.info(`[media] migração: ${total} mídia(s) movida(s) do banco para o disco`);

    await purgeExpiredMedia(now);

    const lastSweep = globalForMedia.__voceroMediaLastSweepAt ?? 0;
    if (now.getTime() - lastSweep >= SWEEP_INTERVAL_MS) {
      globalForMedia.__voceroMediaLastSweepAt = now.getTime();
      await sweepOrphanFiles(now);
    }
  } finally {
    globalForMedia.__voceroMediaMaintenanceRunning = false;
  }
}

export function startMediaMaintenanceScheduler(): void {
  if (globalForMedia.__voceroMediaMaintenanceTimer) return;
  const run = () =>
    void runMediaMaintenance().catch((err) => console.error("[media] manutenção falhou:", err));
  // Primeira rodada logo após o boot (sem competir com a reconexão inicial).
  setTimeout(run, 30_000);
  globalForMedia.__voceroMediaMaintenanceTimer = setInterval(run, TICK_MS);
}
