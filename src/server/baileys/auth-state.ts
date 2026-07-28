import { eq } from "drizzle-orm";
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/**
 * Estado de autenticación de Baileys persistido en Postgres, cifrado en
 * reposo (mismo `lib/crypto` AES-256-GCM que el token de Meta). Equivalente
 * a `useMultiFileAuthState` de Baileys, pero respaldado por BD en vez de
 * archivos — un blob JSON completo por organización (volumen bajo, sin
 * necesidad de una tabla de claves individuales en esta escala).
 */

type StoredKeys = {
  [category: string]: { [id: string]: unknown } | undefined;
};

type StoredState = {
  creds: AuthenticationCreds;
  keys: StoredKeys;
};

export type LoadedAuthState = {
  state: AuthenticationState;
  saveState: () => Promise<void>;
};

async function readStoredState(
  organizationId: string
): Promise<StoredState | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.unofficialChannel)
    .where(eq(schema.unofficialChannel.organizationId, organizationId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const json = decryptSecret({
    cipher: row.authStateCipher,
    iv: row.authStateIv,
    tag: row.authStateTag,
  });
  return JSON.parse(json, BufferJSON.reviver) as StoredState;
}

export async function loadAuthState(
  organizationId: string
): Promise<LoadedAuthState> {
  const existing = await readStoredState(organizationId);
  const stored: StoredState = existing ?? { creds: initAuthCreds(), keys: {} };

  async function persist(): Promise<void> {
    const json = JSON.stringify(stored, BufferJSON.replacer);
    const enc = encryptSecret(json);
    const db = getDb();
    await db
      .insert(schema.unofficialChannel)
      .values({
        id: newId("unofficialChannel"),
        organizationId,
        authStateCipher: enc.cipher,
        authStateIv: enc.iv,
        authStateTag: enc.tag,
      })
      .onConflictDoUpdate({
        target: [schema.unofficialChannel.organizationId],
        set: {
          authStateCipher: enc.cipher,
          authStateIv: enc.iv,
          authStateTag: enc.tag,
          updatedAt: new Date(),
        },
      });
  }

  const state: AuthenticationState = {
    creds: stored.creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(
        type: T,
        ids: string[]
      ) => {
        const data: { [id: string]: SignalDataTypeMap[T] } = {};
        for (const id of ids) {
          let value = stored.keys[type]?.[id];
          if (type === "app-state-sync-key" && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(
              value as object
            );
          }
          if (value !== undefined && value !== null) {
            data[id] = value as SignalDataTypeMap[T];
          }
        }
        return data;
      },
      set: async (data) => {
        for (const category of Object.keys(data) as (keyof typeof data)[]) {
          const bucket = (stored.keys[category as string] ??= {});
          const values = data[category] as
            | Record<string, unknown>
            | undefined;
          for (const id in values) {
            const value = values[id];
            if (value) bucket[id] = value;
            else delete bucket[id];
          }
        }
        await persist();
      },
    },
  };

  return { state, saveState: persist };
}

export async function deleteAuthState(organizationId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.unofficialChannel)
    .where(eq(schema.unofficialChannel.organizationId, organizationId));
}

/** Organizaciones con una sesión ya pareada (para reconectar al arrancar). */
export async function listPairedOrganizations(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ organizationId: schema.unofficialChannel.organizationId })
    .from(schema.unofficialChannel);
  return rows.map((r) => r.organizationId);
}
