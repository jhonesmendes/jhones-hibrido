import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

export type AdminClientRow = typeof schema.adminClient.$inferSelect;

export async function listAdminClients(): Promise<AdminClientRow[]> {
  const db = getDb();
  return db.select().from(schema.adminClient).orderBy(schema.adminClient.name);
}

export async function getAdminClient(id: string): Promise<AdminClientRow | null> {
  const db = getDb();
  const rows = await db.select().from(schema.adminClient).where(eq(schema.adminClient.id, id)).limit(1);
  return rows[0] ?? null;
}

export function decryptClientSecret(row: AdminClientRow): string {
  return decryptSecret({
    cipher: row.internalSecretCipher,
    iv: row.internalSecretIv,
    tag: row.internalSecretTag,
  });
}

/** Gera um segredo novo forte — o operador cola isso na env
 * `LICENSE_CONTROL_SECRET` do cliente ao provisionar a instância dele. */
export function generateClientSecret(): string {
  return randomBytes(32).toString("hex");
}

export async function registerAdminClient(input: {
  name: string;
  baseUrl: string;
  internalSecret: string;
  contactWhatsapp?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
}): Promise<AdminClientRow> {
  const enc = encryptSecret(input.internalSecret);
  const db = getDb();
  const inserted = await db
    .insert(schema.adminClient)
    .values({
      id: newId("adminClient"),
      name: input.name,
      baseUrl: input.baseUrl.replace(/\/+$/, ""),
      internalSecretCipher: enc.cipher,
      internalSecretIv: enc.iv,
      internalSecretTag: enc.tag,
      contactWhatsapp: input.contactWhatsapp ?? null,
      contactEmail: input.contactEmail ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return inserted[0]!;
}

export async function updateAdminClient(
  id: string,
  patch: {
    name?: string;
    baseUrl?: string;
    contactWhatsapp?: string | null;
    contactEmail?: string | null;
    notes?: string | null;
  }
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.adminClient)
    .set({
      ...patch,
      ...(patch.baseUrl ? { baseUrl: patch.baseUrl.replace(/\/+$/, "") } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.adminClient.id, id));
}

export async function deleteAdminClient(id: string): Promise<void> {
  const db = getDb();
  await db.delete(schema.adminClient).where(eq(schema.adminClient.id, id));
}
