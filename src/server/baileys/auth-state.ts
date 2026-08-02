import { eq, inArray } from "drizzle-orm";
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { getDb, schema } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/**
 * Estado de autenticação do Baileys persistido no Postgres, criptografado em
 * repouso (mesmo `lib/crypto` AES-256-GCM que o token da Meta). Equivalente
 * a `useMultiFileAuthState` do Baileys, mas respaldado por BD em vez de
 * arquivos — um blob JSON completo por CANAL (v0.1: `unofficial_channel.id`,
 * não mais por organização — múltiplos canais = múltiplas linhas, cada uma
 * já criada com um estado vazio antes de conectar pela 1ª vez, ver
 * `server/settings/unofficial-channels.ts:createUnofficialChannel`).
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

async function readStoredState(channelId: string): Promise<StoredState | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.unofficialChannel)
    .where(eq(schema.unofficialChannel.id, channelId))
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

export async function loadAuthState(channelId: string): Promise<LoadedAuthState> {
  const existing = await readStoredState(channelId);
  const stored: StoredState = existing ?? { creds: initAuthCreds(), keys: {} };

  async function persist(): Promise<void> {
    const json = JSON.stringify(stored, BufferJSON.replacer);
    const enc = encryptSecret(json);
    const db = getDb();
    await db
      .update(schema.unofficialChannel)
      .set({
        authStateCipher: enc.cipher,
        authStateIv: enc.iv,
        authStateTag: enc.tag,
        updatedAt: new Date(),
      })
      .where(eq(schema.unofficialChannel.id, channelId));
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

/** Reseta o auth-state para vazio (logout) — mantém a linha do canal (nome,
 * departamento) e o `channelId`, só exige um QR novo para reconectar.
 * Diferente de excluir o canal (ver `deleteUnofficialChannel`). */
export async function resetAuthState(channelId: string): Promise<void> {
  const json = JSON.stringify(
    { creds: initAuthCreds(), keys: {} },
    BufferJSON.replacer
  );
  const enc = encryptSecret(json);
  const db = getDb();
  await db
    .update(schema.unofficialChannel)
    .set({
      authStateCipher: enc.cipher,
      authStateIv: enc.iv,
      authStateTag: enc.tag,
      updatedAt: new Date(),
    })
    .where(eq(schema.unofficialChannel.id, channelId));
}

/** Canais com uma sessão já pareada (para reconectar ao iniciar) — só os
 * que chegaram a conectar de fato, não todo canal criado. */
export async function listPairedChannels(): Promise<
  { channelId: string; organizationId: string }[]
> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.unofficialChannel.id,
      organizationId: schema.unofficialChannel.organizationId,
    })
    .from(schema.unofficialChannel)
    .where(inArray(schema.unofficialChannel.status, ["connected", "connecting"]));
  return rows.map((r) => ({ channelId: r.id, organizationId: r.organizationId }));
}
