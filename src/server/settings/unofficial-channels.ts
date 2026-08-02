import { and, asc, eq } from "drizzle-orm";
import { BufferJSON, initAuthCreds } from "@whiskeysockets/baileys";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { encryptSecret } from "@/lib/crypto";
import { scoped } from "@/lib/db/tenant";

export type UnofficialChannelRow = typeof schema.unofficialChannel.$inferSelect;

/** Todos os canais não oficiais da organização (v0.1: N por org). */
export async function listUnofficialChannels(
  organizationId: string
): Promise<UnofficialChannelRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.unofficialChannel)
    .where(scoped(schema.unofficialChannel.organizationId, organizationId))
    .orderBy(asc(schema.unofficialChannel.createdAt));
}

export async function getUnofficialChannelById(
  id: string,
  organizationId: string
): Promise<UnofficialChannelRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.unofficialChannel)
    .where(
      and(
        eq(schema.unofficialChannel.id, id),
        scoped(schema.unofficialChannel.organizationId, organizationId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Cria a linha do canal com um auth-state vazio já cifrado (v0.1): ao
 * contrário do fluxo antigo (linha só nascia no primeiro `creds.update` do
 * Baileys), o canal precisa existir ANTES de conectar — é o `channelId` que
 * o `WhatsAppManager` usa para indexar a sessão. Conectar carrega este
 * estado vazio e o Baileys o preenche/persiste normalmente a partir daí.
 */
export async function createUnofficialChannel(
  organizationId: string,
  input: { name?: string; description?: string | null; departmentId?: string | null }
): Promise<UnofficialChannelRow> {
  const db = getDb();
  const emptyState = JSON.stringify(
    { creds: initAuthCreds(), keys: {} },
    BufferJSON.replacer
  );
  const enc = encryptSecret(emptyState);
  const inserted = await db
    .insert(schema.unofficialChannel)
    .values({
      id: newId("unofficialChannel"),
      organizationId,
      name: input.name?.trim() || "WhatsApp",
      description: input.description ?? null,
      departmentId: input.departmentId ?? null,
      authStateCipher: enc.cipher,
      authStateIv: enc.iv,
      authStateTag: enc.tag,
      status: "disconnected",
    })
    .returning();
  return inserted[0]!;
}

export async function updateUnofficialChannelMeta(
  id: string,
  organizationId: string,
  patch: {
    name?: string;
    description?: string | null;
    isActive?: boolean;
    departmentId?: string | null;
  }
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.unofficialChannel)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(schema.unofficialChannel.id, id),
        scoped(schema.unofficialChannel.organizationId, organizationId)
      )
    );
}

/** Remove a linha por completo (diferente de desconectar — ver manager.ts:
 * disconnect() só reseta o auth-state, mantém nome/departamento). O
 * chamador (API route) já deve ter desconectado o socket ativo antes. */
export async function deleteUnofficialChannel(
  id: string,
  organizationId: string
): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.unofficialChannel)
    .where(
      and(
        eq(schema.unofficialChannel.id, id),
        scoped(schema.unofficialChannel.organizationId, organizationId)
      )
    );
}

/** Canal "padrão" da org: o mais antigo ainda ativo — fallback para envios
 * sem `conversation.unofficialChannelId` definido (conversa nova, ou
 * organização com um único canal). */
export async function resolveDefaultUnofficialChannelId(
  organizationId: string
): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.unofficialChannel.id })
    .from(schema.unofficialChannel)
    .where(
      and(
        scoped(schema.unofficialChannel.organizationId, organizationId),
        eq(schema.unofficialChannel.isActive, true)
      )
    )
    .orderBy(asc(schema.unofficialChannel.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Checagem leve: existe ao menos 1 canal não oficial conectado — usado por
 * gates que só precisam saber "tem canal disponível" (Campanhas), não qual
 * canal específico. */
export async function isAnyUnofficialChannelConnected(
  organizationId: string
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.unofficialChannel.id })
    .from(schema.unofficialChannel)
    .where(
      and(
        scoped(schema.unofficialChannel.organizationId, organizationId),
        eq(schema.unofficialChannel.isActive, true),
        eq(schema.unofficialChannel.status, "connected")
      )
    )
    .limit(1);
  return rows.length > 0;
}
