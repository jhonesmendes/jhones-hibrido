import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { getEnv } from "@/lib/env";
import { getBackupConfig } from "@/server/backup/config";

const execFileAsync = promisify(execFile);

export type DbBackupRow = typeof schema.dbBackup.$inferSelect;

/** Timeout generoso — pg_dump/pg_restore de um banco com muita mídia (mensagens
 * guardam anexo em base64 na própria tabela, não em disco/S3) pode demorar. */
const DUMP_TIMEOUT_MS = 20 * 60 * 1000;

async function ensureBackupDir(): Promise<string> {
  const dir = getEnv().BACKUP_DIR;
  await mkdir(dir, { recursive: true });
  return dir;
}

function timestampSlug(d: Date): string {
  return d.toISOString().replace(/[:.]/g, "-");
}

/**
 * Roda `pg_dump` (formato custom, comprimido) contra o próprio banco desta
 * instância — nunca sai da máquina, fica no volume local (`BACKUP_DIR`).
 * Insere a linha ANTES de rodar (status "running", visível como em
 * andamento no painel) e atualiza ao terminar.
 */
export async function runBackup(kind: "scheduled" | "manual" | "pre_restore"): Promise<string> {
  const db = getDb();
  const dir = await ensureBackupDir();
  const startedAt = new Date();
  const filename = `vocero-${kind}-${timestampSlug(startedAt)}.dump`;
  const filePath = path.join(dir, filename);

  const id = newId("dbBackup");
  await db.insert(schema.dbBackup).values({
    id,
    filename,
    filePath,
    status: "running",
    kind,
    startedAt,
  });

  try {
    await execFileAsync(
      "pg_dump",
      [getEnv().DATABASE_URL, "-Fc", "-f", filePath],
      { timeout: DUMP_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }
    );
    const st = await stat(filePath);
    await db
      .update(schema.dbBackup)
      .set({ status: "done", sizeBytes: st.size, finishedAt: new Date() })
      .where(eq(schema.dbBackup.id, id));
    if (kind !== "pre_restore") await enforceRetention();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.dbBackup)
      .set({ status: "failed", error: detail.slice(0, 2000), finishedAt: new Date() })
      .where(eq(schema.dbBackup.id, id));
    // Arquivo parcial de um dump que falhou no meio — não deixa lixo
    // ocupando espaço nem confundindo uma listagem futura.
    await unlink(filePath).catch(() => {});
  }
  return id;
}

/** Apaga os backups mais antigos além da retenção configurada — só entre
 * `scheduled`/`manual` concluídos; `pre_restore` nunca é apagado sozinho
 * (fica até o operador remover à mão, é a rede de segurança de uma
 * restauração). */
async function enforceRetention(): Promise<void> {
  const { retentionCount } = await getBackupConfig();
  const db = getDb();
  const done = await db
    .select({ id: schema.dbBackup.id })
    .from(schema.dbBackup)
    .where(and(eq(schema.dbBackup.status, "done"), ne(schema.dbBackup.kind, "pre_restore")))
    .orderBy(desc(schema.dbBackup.startedAt));
  const toRemove = done.slice(retentionCount);
  for (const row of toRemove) {
    await deleteBackup(row.id).catch((err) =>
      console.error(`[backup] falha ao apagar backup antigo ${row.id} na retenção:`, err)
    );
  }
}

export async function listBackups(): Promise<DbBackupRow[]> {
  const db = getDb();
  return db.select().from(schema.dbBackup).orderBy(desc(schema.dbBackup.startedAt)).limit(100);
}

export async function getBackup(id: string): Promise<DbBackupRow | null> {
  const db = getDb();
  const rows = await db.select().from(schema.dbBackup).where(eq(schema.dbBackup.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteBackup(id: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(schema.dbBackup)
    .where(eq(schema.dbBackup.id, id))
    .returning({ filePath: schema.dbBackup.filePath });
  if (!rows[0]) return false;
  await unlink(rows[0].filePath).catch(() => {});
  return true;
}

export type DbRestoreLogRow = typeof schema.dbRestoreLog.$inferSelect;

/**
 * Restaura o banco a partir de um backup — ação destrutiva. Antes de tocar
 * em qualquer coisa, tira um snapshot de segurança (`pre_restore`) do
 * estado atual, pra sempre existir um caminho de volta mesmo se a
 * restauração escolhida for a errada.
 */
export async function startRestore(sourceBackupId: string): Promise<string> {
  const db = getDb();
  const source = await getBackup(sourceBackupId);
  if (!source || source.status !== "done") {
    throw new Error("Backup de origem não encontrado ou incompleto");
  }

  const logId = newId("dbRestoreLog");
  await db.insert(schema.dbRestoreLog).values({
    id: logId,
    sourceBackupId,
    status: "running",
  });

  // O trabalho pesado (pg_restore) roda em segundo plano — o chamador já
  // tem o `logId` pra devolver na hora e o painel acompanha via polling em
  // /api/internal/backups/restores/[logId].
  void runRestoreWork(logId, source).catch((err) =>
    console.error(`[backup] restauração ${logId} falhou fora do try/catch interno:`, err)
  );
  return logId;
}

async function runRestoreWork(
  logId: string,
  source: DbBackupRow
): Promise<void> {
  const db = getDb();
  try {
    const preRestoreBackupId = await runBackup("pre_restore");
    const preRestoreRow = await getBackup(preRestoreBackupId);
    if (preRestoreRow?.status !== "done") {
      throw new Error(
        "Não foi possível tirar o snapshot de segurança antes de restaurar — abortado sem tocar no banco"
      );
    }
    await db
      .update(schema.dbRestoreLog)
      .set({ preRestoreBackupId })
      .where(eq(schema.dbRestoreLog.id, logId));

    await execFileAsync(
      "pg_restore",
      ["-d", getEnv().DATABASE_URL, "--clean", "--if-exists", source.filePath],
      { timeout: DUMP_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }
    );

    await db
      .update(schema.dbRestoreLog)
      .set({ status: "done", finishedAt: new Date() })
      .where(eq(schema.dbRestoreLog.id, logId));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.dbRestoreLog)
      .set({ status: "failed", error: detail.slice(0, 2000), finishedAt: new Date() })
      .where(eq(schema.dbRestoreLog.id, logId));
  }
}

export async function listRestoreLogs(): Promise<DbRestoreLogRow[]> {
  const db = getDb();
  return db.select().from(schema.dbRestoreLog).orderBy(desc(schema.dbRestoreLog.startedAt)).limit(50);
}

export async function getRestoreLog(id: string): Promise<DbRestoreLogRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.dbRestoreLog)
    .where(eq(schema.dbRestoreLog.id, id))
    .limit(1);
  return rows[0] ?? null;
}
