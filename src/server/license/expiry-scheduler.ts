import { and, eq, isNotNull, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { invalidateLicenseCache } from "@/server/license/service";

/** Passa `active` → `expired` toda licença cujo `expiresAt` já passou —
 * cobre o vencimento do trial (o painel central lida com planos pagos via
 * PATCH explícito, mas o trial vence sozinho sem ninguém empurrar nada). */
export async function runLicenseExpiryCycle(): Promise<void> {
  const db = getDb();
  const expired = await db
    .update(schema.license)
    .set({ status: "expired", updatedAt: new Date() })
    .where(
      and(
        eq(schema.license.status, "active"),
        isNotNull(schema.license.expiresAt),
        lt(schema.license.expiresAt, new Date())
      )
    )
    .returning({ organizationId: schema.license.organizationId });
  for (const row of expired) invalidateLicenseCache(row.organizationId);
}

const globalForLicense = globalThis as unknown as {
  __voceroLicenseExpiryTimer?: ReturnType<typeof setInterval>;
};

const INTERVAL_MS = 60 * 60 * 1000; // 1h — vencimento não é sensível a segundos

export function startLicenseExpiryScheduler(): void {
  if (globalForLicense.__voceroLicenseExpiryTimer) return;
  void runLicenseExpiryCycle().catch((err) =>
    console.error("[license] ciclo de expiração falhou:", err)
  );
  globalForLicense.__voceroLicenseExpiryTimer = setInterval(() => {
    void runLicenseExpiryCycle().catch((err) =>
      console.error("[license] ciclo de expiração falhou:", err)
    );
  }, INTERVAL_MS);
}
