import { customAlphabet } from "nanoid";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import type { ChannelConfig, ConnectionState, UnofficialProvider } from "@/lib/unofficial";

/**
 * Persistencia del canal NO oficial (gateway Evolution/WPPConnect/WAHA).
 * Un canal por organización; API key cifrada en reposo (AES-256-GCM),
 * mismo tratamiento que el token de Meta.
 */

export type UnofficialChannel = {
  id: string;
  organizationId: string;
  provider: UnofficialProvider;
  baseUrl: string;
  instanceName: string;
  apiKey: string;
  webhookToken: string;
  displayPhoneNumber: string | null;
  status: ConnectionState;
};

type Row = typeof schema.unofficialChannel.$inferSelect;

const webhookTokenAlphabet = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  32
);

function toChannel(row: Row): UnofficialChannel {
  return {
    id: row.id,
    organizationId: row.organizationId,
    provider: row.provider,
    baseUrl: row.baseUrl,
    instanceName: row.instanceName,
    apiKey: decryptSecret({
      cipher: row.apiKeyCipher,
      iv: row.apiKeyIv,
      tag: row.apiKeyTag,
    }),
    webhookToken: row.webhookToken,
    displayPhoneNumber: row.displayPhoneNumber,
    status: row.status,
  };
}

export function toConfig(ch: UnofficialChannel): ChannelConfig {
  return {
    provider: ch.provider,
    baseUrl: ch.baseUrl,
    instanceName: ch.instanceName,
    apiKey: ch.apiKey,
  };
}

export async function getChannelByOrg(
  organizationId: string
): Promise<UnofficialChannel | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.unofficialChannel)
    .where(scoped(schema.unofficialChannel.organizationId, organizationId))
    .limit(1);
  return rows[0] ? toChannel(rows[0]) : null;
}

/** Resuelve el canal por el segmento secreto del webhook (enrutamiento). */
export async function getChannelByWebhookToken(
  webhookToken: string
): Promise<UnofficialChannel | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.unofficialChannel)
    .where(eq(schema.unofficialChannel.webhookToken, webhookToken))
    .limit(1);
  return rows[0] ? toChannel(rows[0]) : null;
}

export async function saveChannel(input: {
  organizationId: string;
  provider: UnofficialProvider;
  baseUrl: string;
  instanceName: string;
  apiKey: string;
}): Promise<UnofficialChannel> {
  const db = getDb();
  const enc = encryptSecret(input.apiKey);
  const baseUrl = input.baseUrl.replace(/\/+$/, "");

  // El token del webhook se conserva entre re-guardados (URL estable).
  const existing = await getChannelByOrg(input.organizationId);
  const webhookToken = existing?.webhookToken ?? webhookTokenAlphabet();

  await db
    .insert(schema.unofficialChannel)
    .values({
      id: newId("unofficialChannel"),
      organizationId: input.organizationId,
      provider: input.provider,
      baseUrl,
      instanceName: input.instanceName,
      apiKeyCipher: enc.cipher,
      apiKeyIv: enc.iv,
      apiKeyTag: enc.tag,
      webhookToken,
      status: "disconnected",
    })
    .onConflictDoUpdate({
      target: [schema.unofficialChannel.organizationId],
      set: {
        provider: input.provider,
        baseUrl,
        instanceName: input.instanceName,
        apiKeyCipher: enc.cipher,
        apiKeyIv: enc.iv,
        apiKeyTag: enc.tag,
        status: "disconnected",
        updatedAt: new Date(),
      },
    });

  const saved = await getChannelByOrg(input.organizationId);
  if (!saved) throw new Error("canal no encontrado tras upsert");
  return saved;
}

export async function updateChannelStatus(
  organizationId: string,
  status: ConnectionState,
  displayPhoneNumber?: string | null
): Promise<void> {
  const db = getDb();
  const set: Record<string, unknown> = { status, updatedAt: new Date() };
  if (displayPhoneNumber !== undefined) {
    set.displayPhoneNumber = displayPhoneNumber;
  }
  await db
    .update(schema.unofficialChannel)
    .set(set)
    .where(scoped(schema.unofficialChannel.organizationId, organizationId));
}

export async function deleteChannel(organizationId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.unofficialChannel)
    .where(scoped(schema.unofficialChannel.organizationId, organizationId));
}

/** URL pública que el gateway debe invocar con los eventos entrantes. */
export function webhookUrlFor(channel: UnofficialChannel): string {
  return `${getEnv().APP_BASE_URL.replace(/\/+$/, "")}/api/webhooks/unofficial/${channel.webhookToken}`;
}

/** Últimos 4 de la API key para la UI (jamás la clave completa). */
export function apiKeyLast4(apiKey: string): string {
  return apiKey.slice(-4);
}
