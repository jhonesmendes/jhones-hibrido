import type { WASocket } from "@whiskeysockets/baileys";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Foto de perfil do contato — só o WhatsApp Web (Baileys) tem acesso; a
 * Cloud API oficial da Meta não expõe foto de contato nenhuma. A URL do CDN
 * do WhatsApp é temporária (mesma razão pela qual mídia de mensagem também é
 * baixada e guardada — nunca referenciamos URL de terceiro persistente), por
 * isso os bytes são cacheados no Postgres (sem S3/R2) com um TTL de
 * atualização pra não martelar o WhatsApp a cada mensagem recebida.
 */
const AVATAR_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function refreshContactAvatar(
  organizationId: string,
  sock: WASocket,
  jid: string,
  phone: string
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.contact.id,
      avatarUpdatedAt: schema.contact.avatarUpdatedAt,
    })
    .from(schema.contact)
    .where(
      and(
        eq(schema.contact.organizationId, organizationId),
        eq(schema.contact.phone, phone)
      )
    )
    .limit(1);
  const contact = rows[0];
  if (!contact) return;

  if (
    contact.avatarUpdatedAt &&
    Date.now() - contact.avatarUpdatedAt.getTime() < AVATAR_REFRESH_INTERVAL_MS
  ) {
    return;
  }

  let url: string | undefined;
  try {
    url = await sock.profilePictureUrl(jid, "image", 8000);
  } catch {
    // sem foto (privacidade do contato) ou erro transitório — segue sem
  }

  if (!url) {
    await db
      .update(schema.contact)
      .set({ avatarUpdatedAt: new Date() })
      .where(eq(schema.contact.id, contact.id));
    return;
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) }).catch(
    () => null
  );
  if (!res?.ok) {
    await db
      .update(schema.contact)
      .set({ avatarUpdatedAt: new Date() })
      .where(eq(schema.contact.id, contact.id));
    return;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await db
    .update(schema.contact)
    .set({
      avatarBase64: buffer.toString("base64"),
      avatarMimeType: res.headers.get("content-type") ?? "image/jpeg",
      avatarUpdatedAt: new Date(),
    })
    .where(eq(schema.contact.id, contact.id));
}
