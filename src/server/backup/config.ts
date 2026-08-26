import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export type BackupConfig = {
  enabled: boolean;
  hourOfDay: number;
  retentionCount: number;
};

const SINGLETON_ID = "singleton";

/** Linha única de configuração — cria com os padrões (diário às 3h,
 * retenção de 7) na primeira leitura se ainda não existir. */
export async function getBackupConfig(): Promise<BackupConfig> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.backupConfig)
    .where(eq(schema.backupConfig.id, SINGLETON_ID))
    .limit(1);
  if (rows[0]) {
    return {
      enabled: rows[0].enabled,
      hourOfDay: rows[0].hourOfDay,
      retentionCount: rows[0].retentionCount,
    };
  }
  const inserted = await db
    .insert(schema.backupConfig)
    .values({ id: SINGLETON_ID })
    .onConflictDoNothing()
    .returning();
  const row = inserted[0];
  if (row) {
    return { enabled: row.enabled, hourOfDay: row.hourOfDay, retentionCount: row.retentionCount };
  }
  // Corrida rara (dois processos criando ao mesmo tempo): a que perdeu o
  // onConflictDoNothing relê a que ganhou.
  return getBackupConfig();
}

export async function updateBackupConfig(patch: {
  enabled?: boolean;
  hourOfDay?: number;
  retentionCount?: number;
}): Promise<BackupConfig> {
  await getBackupConfig(); // garante que a linha singleton existe
  const db = getDb();
  const updated = await db
    .update(schema.backupConfig)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.backupConfig.id, SINGLETON_ID))
    .returning();
  const row = updated[0]!;
  return { enabled: row.enabled, hourOfDay: row.hourOfDay, retentionCount: row.retentionCount };
}
