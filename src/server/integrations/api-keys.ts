import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

const TOKEN_PREFIX = "vok_";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type ApiKeyRow = {
  id: string;
  name: string;
  tokenLast4: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export async function listApiKeys(organizationId: string): Promise<ApiKeyRow[]> {
  const db = getDb();
  return db
    .select({
      id: schema.apiKey.id,
      name: schema.apiKey.name,
      tokenLast4: schema.apiKey.tokenLast4,
      createdAt: schema.apiKey.createdAt,
      lastUsedAt: schema.apiKey.lastUsedAt,
      revokedAt: schema.apiKey.revokedAt,
    })
    .from(schema.apiKey)
    .where(scoped(schema.apiKey.organizationId, organizationId))
    .orderBy(desc(schema.apiKey.createdAt));
}

/**
 * Gera uma chave nova — o token de verdade só existe aqui, devolvido uma
 * vez pra quem chamou copiar (mesmo padrão do segredo do painel central em
 * `generateClientSecret`/`registerAdminClient`). Nunca fica reexibível.
 */
export async function createApiKey(
  organizationId: string,
  name: string
): Promise<{ id: string; token: string }> {
  const db = getDb();
  const token = TOKEN_PREFIX + randomBytes(32).toString("hex");
  const id = newId("apiKey");
  await db.insert(schema.apiKey).values({
    id,
    organizationId,
    name,
    tokenHash: hashToken(token),
    tokenLast4: token.slice(-4),
  });
  return { id, token };
}

export async function revokeApiKey(organizationId: string, id: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.apiKey)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiKey.organizationId, organizationId), eq(schema.apiKey.id, id)));
}

/**
 * Verifica um token recebido (ex.: header `x-internal-key`) — devolve a
 * organização dona da chave se ela existir e não estiver revogada, ou
 * `null`. Atualiza `lastUsedAt` em melhor esforço, sem bloquear a resposta
 * por causa disso (nunca lança).
 */
export async function verifyApiKey(
  token: string
): Promise<{ organizationId: string; apiKeyId: string } | null> {
  if (!token) return null;
  const db = getDb();
  const rows = await db
    .select({
      id: schema.apiKey.id,
      organizationId: schema.apiKey.organizationId,
      revokedAt: schema.apiKey.revokedAt,
    })
    .from(schema.apiKey)
    .where(eq(schema.apiKey.tokenHash, hashToken(token)))
    .limit(1);
  const row = rows[0];
  if (!row || row.revokedAt) return null;

  db.update(schema.apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKey.id, row.id))
    .catch((err) => console.error("[api-key] falha ao atualizar lastUsedAt:", err));

  return { organizationId: row.organizationId, apiKeyId: row.id };
}
