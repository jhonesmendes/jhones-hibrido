import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getBackupConfig } from "@/server/backup/config";
import { runBackup } from "@/server/backup/engine";

/** Checa a cada 15min se já passou da hora configurada e o backup de HOJE
 * ainda não rodou — mesmo padrão de setInterval a nível de módulo dos
 * outros schedulers (followup, fila, campanhas — Constituição II, sem fila
 * externa). Não usa cron real: só compara a data do último backup
 * `scheduled` concluído/em andamento com a data de hoje. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

async function tick(): Promise<void> {
  const config = await getBackupConfig();
  if (!config.enabled) return;

  const now = new Date();
  if (now.getHours() < config.hourOfDay) return;

  const db = getDb();
  const lastScheduled = await db
    .select({ startedAt: schema.dbBackup.startedAt })
    .from(schema.dbBackup)
    .where(eq(schema.dbBackup.kind, "scheduled"))
    .orderBy(desc(schema.dbBackup.startedAt))
    .limit(1);
  const last = lastScheduled[0]?.startedAt;
  if (last && isSameDay(last, now)) return; // já rodou hoje

  await runBackup("scheduled").catch((err) =>
    console.error("[backup] ciclo agendado falhou:", err)
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const globalForBackup = globalThis as unknown as {
  __voceroBackupTimer?: ReturnType<typeof setInterval>;
};

/** Inicia o scheduler uma única vez por processo. */
export function startBackupScheduler(): void {
  if (globalForBackup.__voceroBackupTimer) return;
  globalForBackup.__voceroBackupTimer = setInterval(() => {
    void tick();
  }, CHECK_INTERVAL_MS);
}
