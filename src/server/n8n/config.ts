import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { N8nCredentials } from "@/server/n8n/client";

export async function resolveN8nConfig(
  organizationId: string
): Promise<N8nCredentials | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.n8nConfig)
    .where(eq(schema.n8nConfig.organizationId, organizationId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    baseUrl: row.baseUrl,
    apiKey: decryptSecret({
      cipher: row.apiKeyCipher,
      iv: row.apiKeyIv,
      tag: row.apiKeyTag,
    }),
  };
}

export type N8nConfigView = {
  baseUrl: string;
  apiKeyLast4: string;
};

export async function getN8nConfigView(
  organizationId: string
): Promise<N8nConfigView | null> {
  const db = getDb();
  const rows = await db
    .select({
      baseUrl: schema.n8nConfig.baseUrl,
      apiKeyLast4: schema.n8nConfig.apiKeyLast4,
    })
    .from(schema.n8nConfig)
    .where(eq(schema.n8nConfig.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveN8nConfig(
  organizationId: string,
  input: { baseUrl: string; apiKey?: string }
): Promise<void> {
  const db = getDb();
  const existing = await db
    .select({ id: schema.n8nConfig.id })
    .from(schema.n8nConfig)
    .where(eq(schema.n8nConfig.organizationId, organizationId))
    .limit(1);

  const values: {
    baseUrl: string;
    apiKeyCipher?: string;
    apiKeyIv?: string;
    apiKeyTag?: string;
    apiKeyLast4?: string;
  } = { baseUrl: input.baseUrl };
  if (input.apiKey) {
    const enc = encryptSecret(input.apiKey);
    values.apiKeyCipher = enc.cipher;
    values.apiKeyIv = enc.iv;
    values.apiKeyTag = enc.tag;
    values.apiKeyLast4 = input.apiKey.slice(-4);
  }

  if (existing[0]) {
    await db
      .update(schema.n8nConfig)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.n8nConfig.id, existing[0].id));
    return;
  }

  if (!input.apiKey) {
    throw new Error("Informe a chave de API na primeira configuração");
  }
  await db.insert(schema.n8nConfig).values({
    id: newId("n8nConfig"),
    organizationId,
    baseUrl: input.baseUrl,
    apiKeyCipher: values.apiKeyCipher!,
    apiKeyIv: values.apiKeyIv!,
    apiKeyTag: values.apiKeyTag!,
    apiKeyLast4: values.apiKeyLast4!,
  });
}

export async function deleteN8nConfig(organizationId: string): Promise<void> {
  const db = getDb();
  await db.delete(schema.n8nConfig).where(eq(schema.n8nConfig.organizationId, organizationId));
}
