import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import {
  graphRequest,
  MetaApiError,
  normalizeRecipient,
  uploadMetaMedia,
} from "@/lib/meta/client";
import { mediaKindFromMime, type MediaKind } from "@/lib/media";
import { publish } from "@/server/events/bus";
import {
  getCredentialsById,
  getCredentialsByOrg,
  markReconnectRequired,
  type Credentials,
} from "@/server/whatsapp/credentials";
import { isWindowOpen } from "@/server/inbox/window";
import { LOCAL_MEDIA_MARKER, serializeMessage } from "@/server/inbox/ingest";
import {
  BaileysSendError,
  sendMedia as sendBaileysMedia,
  sendText as sendBaileysText,
} from "@/server/baileys/sender";
import { baileysMessageId } from "@/server/baileys/inbound";
import { resolveDefaultUnofficialChannelId } from "@/server/settings/unofficial-channels";

/** Erro tipado do envio; `code` mapeia para HTTP na camada de API. */
export class SendError extends Error {
  code:
    | "sandbox_violation"
    | "not_connected"
    | "recipient_not_found"
    | "reconnect_required"
    | "window_closed"
    | "meta_error"
    | "meta_unavailable";

  constructor(code: SendError["code"], message: string) {
    super(message);
    this.name = "SendError";
    this.code = code;
  }
}

type SendResult = { messageId: string };

/** Resolve o número oficial pelo qual esta conversa responde: o número
 * amarrado (`conversation.metaCredentialId`, sticky pela última mensagem
 * recebida) tem prioridade; sem amarração (conversa nova, ou organização
 * com um único número), cai no padrão da organização. */
async function resolveOutboundCredentials(
  organizationId: string,
  metaCredentialId: string | null
): Promise<Credentials | null> {
  if (metaCredentialId) {
    const byId = await getCredentialsById(metaCredentialId, organizationId);
    if (byId) return byId;
  }
  return getCredentialsByOrg(organizationId);
}

/** Mesma lógica de `resolveOutboundCredentials`, para o canal não oficial:
 * `conversation.unofficialChannelId` (sticky) tem prioridade; sem
 * amarração, cai no canal padrão da organização. */
async function resolveOutboundChannelId(
  organizationId: string,
  unofficialChannelId: string | null
): Promise<string | null> {
  if (unofficialChannelId) return unofficialChannelId;
  return resolveDefaultUnofficialChannelId(organizationId);
}

/**
 * Envia uma mensagem de texto livre por WhatsApp.
 *
 * ASSERÇÃO DURA (FR-031): uma conversa de teste do Laboratório jamais
 * chega à API real — é lançada ANTES de tocar credenciais ou rede.
 */
export async function sendText(input: {
  conversationId: string;
  organizationId: string;
  text: string;
  aiGenerated?: boolean;
  /** Override pontual do canal de envio (seletor manual no composer). */
  channelOverride?: "official" | "unofficial";
}): Promise<SendResult> {
  const db = getDb();

  const rows = await db
    .select({
      conversation: schema.conversation,
      contact: schema.contact,
    })
    .from(schema.conversation)
    .innerJoin(
      schema.contact,
      eq(schema.conversation.contactId, schema.contact.id)
    )
    .where(eq(schema.conversation.id, input.conversationId))
    .limit(1);
  const row = rows[0];
  if (!row || row.conversation.organizationId !== input.organizationId) {
    throw new SendError("meta_error", "Conversa não encontrada");
  }

  if (row.conversation.isTest) {
    throw new SendError(
      "sandbox_violation",
      "Conversa de teste do Laboratório: o envio real é proibido"
    );
  }

  // Roteamento por canal: por padrão a conversa segue o canal da última
  // mensagem recebida (sticky); um override pontual do composer vale só
  // para este envio, sem alterar o roteamento automático de entradas.
  const effectiveChannel = input.channelOverride ?? row.conversation.channel;
  if (row.contact.kind === "group" && effectiveChannel !== "unofficial") {
    throw new SendError(
      "meta_error",
      "Grupo: só existe no canal não oficial (WhatsApp Web), a Cloud API oficial não suporta grupos"
    );
  }
  if (effectiveChannel === "unofficial") {
    return sendViaUnofficial(input, row.contact, row.conversation.unofficialChannelId);
  }

  if (!isWindowOpen(row.conversation.lastInboundAt)) {
    throw new SendError(
      "window_closed",
      "A janela de 24 horas está fechada; use um modelo aprovado"
    );
  }

  const credentials = await resolveOutboundCredentials(
    input.organizationId,
    row.conversation.metaCredentialId
  );
  if (!credentials) {
    throw new SendError("not_connected", "Não há número de WhatsApp conectado");
  }
  if (credentials.status === "reconnect_required") {
    throw new SendError(
      "reconnect_required",
      "O token do WhatsApp expirou: reconecte o número em Configurações"
    );
  }

  const waMessageId = await callGraphSend(credentials, {
    messaging_product: "whatsapp",
    to: normalizeRecipient(row.contact.phone),
    type: "text",
    text: { body: input.text },
  });

  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      waMessageId,
      direction: "out",
      type: "text",
      text: input.text,
      status: "pending",
      aiGenerated: input.aiGenerated ?? false,
    })
    .returning();
  const message = inserted[0]!;

  await db
    .update(schema.conversation)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.conversation.id, input.conversationId));

  publish(input.organizationId, {
    type: "message.new",
    data: {
      conversationId: input.conversationId,
      message: serializeMessage(message),
    },
  });

  return { messageId: message.id };
}

/**
 * Envia mídia (imagem/documento/áudio/vídeo) — usado tanto pelo composer
 * quanto pelo encaminhamento de mensagens. Mesmas regras do texto: sandbox,
 * janela de 24h no oficial, canal sticky com override pontual.
 */
export async function sendMedia(input: {
  conversationId: string;
  organizationId: string;
  buffer: Buffer;
  mimeType: string;
  filename?: string | null;
  caption?: string;
  channelOverride?: "official" | "unofficial";
}): Promise<SendResult> {
  const db = getDb();

  const rows = await db
    .select({ conversation: schema.conversation, contact: schema.contact })
    .from(schema.conversation)
    .innerJoin(
      schema.contact,
      eq(schema.conversation.contactId, schema.contact.id)
    )
    .where(eq(schema.conversation.id, input.conversationId))
    .limit(1);
  const row = rows[0];
  if (!row || row.conversation.organizationId !== input.organizationId) {
    throw new SendError("meta_error", "Conversa não encontrada");
  }
  if (row.conversation.isTest) {
    throw new SendError(
      "sandbox_violation",
      "Conversa de teste do Laboratório: o envio real é proibido"
    );
  }

  const effectiveChannel = input.channelOverride ?? row.conversation.channel;
  const kind = mediaKindFromMime(input.mimeType);

  if (row.contact.kind === "group" && effectiveChannel !== "unofficial") {
    throw new SendError(
      "meta_error",
      "Grupo: só existe no canal não oficial (WhatsApp Web), a Cloud API oficial não suporta grupos"
    );
  }
  if (effectiveChannel === "unofficial") {
    return sendMediaViaUnofficial(
      input,
      row.contact,
      kind,
      row.conversation.unofficialChannelId
    );
  }

  if (!isWindowOpen(row.conversation.lastInboundAt)) {
    throw new SendError(
      "window_closed",
      "A janela de 24 horas está fechada; use um modelo aprovado"
    );
  }

  const credentials = await resolveOutboundCredentials(
    input.organizationId,
    row.conversation.metaCredentialId
  );
  if (!credentials) {
    throw new SendError("not_connected", "Não há número de WhatsApp conectado");
  }
  if (credentials.status === "reconnect_required") {
    throw new SendError(
      "reconnect_required",
      "O token do WhatsApp expirou: reconecte o número em Configurações"
    );
  }

  let mediaId: string;
  try {
    mediaId = await uploadMetaMedia(credentials.phoneNumberId, credentials.token, {
      buffer: input.buffer,
      mimeType: input.mimeType,
      filename: input.filename ?? "arquivo",
    });
  } catch (err) {
    if (err instanceof MetaApiError) {
      throw new SendError("meta_error", err.message);
    }
    throw err;
  }

  const mediaObject: Record<string, unknown> =
    kind === "document"
      ? { id: mediaId, caption: input.caption, filename: input.filename ?? undefined }
      : kind === "audio"
        ? { id: mediaId }
        : { id: mediaId, caption: input.caption };

  const waMessageId = await callGraphSend(credentials, {
    messaging_product: "whatsapp",
    to: normalizeRecipient(row.contact.phone),
    type: kind,
    [kind]: mediaObject,
  });

  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      waMessageId,
      direction: "out",
      type: kind,
      text: input.caption ?? null,
      mediaUrl: LOCAL_MEDIA_MARKER,
      status: "pending",
    })
    .returning();
  const message = inserted[0]!;

  await db.insert(schema.messageMedia).values({
    id: newId("messageMedia"),
    organizationId: input.organizationId,
    messageId: message.id,
    mimeType: input.mimeType,
    dataBase64: input.buffer.toString("base64"),
    filename: input.filename ?? null,
    sizeBytes: input.buffer.length,
  });

  await db
    .update(schema.conversation)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.conversation.id, input.conversationId));

  publish(input.organizationId, {
    type: "message.new",
    data: {
      conversationId: input.conversationId,
      message: serializeMessage(message, {
        filename: input.filename ?? null,
        sizeBytes: input.buffer.length,
        mimeType: input.mimeType,
      }),
    },
  });

  return { messageId: message.id };
}

async function sendMediaViaUnofficial(
  input: {
    conversationId: string;
    organizationId: string;
    buffer: Buffer;
    mimeType: string;
    filename?: string | null;
    caption?: string;
  },
  contact: { phone: string; kind: string },
  kind: MediaKind,
  unofficialChannelId: string | null
): Promise<SendResult> {
  const db = getDb();
  const target =
    contact.kind === "group"
      ? `${contact.phone}@g.us`
      : normalizeRecipient(contact.phone);

  const channelId = await resolveOutboundChannelId(
    input.organizationId,
    unofficialChannelId
  );
  if (!channelId) {
    throw new SendError(
      "not_connected",
      "Não há WhatsApp Web conectado: confira Configurações → Canais"
    );
  }

  let providerMessageId: string;
  try {
    providerMessageId = await sendBaileysMedia(channelId, target, {
      buffer: input.buffer,
      mimeType: input.mimeType,
      filename: input.filename ?? null,
      caption: input.caption,
    });
  } catch (err) {
    if (err instanceof BaileysSendError) {
      if (err.code === "not_connected") {
        throw new SendError(
          "not_connected",
          "Não há WhatsApp Web conectado: confira Configurações → Canais"
        );
      }
      if (err.code === "recipient_not_found") {
        throw new SendError("recipient_not_found", err.message);
      }
      throw new SendError("meta_unavailable", err.message);
    }
    throw err;
  }

  const waMessageId = baileysMessageId(providerMessageId);
  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      waMessageId,
      direction: "out",
      type: kind,
      text: input.caption ?? null,
      mediaUrl: LOCAL_MEDIA_MARKER,
      status: "sent",
    })
    .onConflictDoNothing({ target: [schema.message.waMessageId] })
    .returning();
  const message = inserted[0];

  if (message) {
    await db.insert(schema.messageMedia).values({
      id: newId("messageMedia"),
      organizationId: input.organizationId,
      messageId: message.id,
      mimeType: input.mimeType,
      dataBase64: input.buffer.toString("base64"),
      filename: input.filename ?? null,
      sizeBytes: input.buffer.length,
    });
  }

  await db
    .update(schema.conversation)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.conversation.id, input.conversationId));

  if (message) {
    publish(input.organizationId, {
      type: "message.new",
      data: {
        conversationId: input.conversationId,
        message: serializeMessage(message, {
          filename: input.filename ?? null,
          sizeBytes: input.buffer.length,
          mimeType: input.mimeType,
        }),
      },
    });
    return { messageId: message.id };
  }
  return { messageId: waMessageId };
}

/**
 * Envio pelo canal NÃO oficial (gateway). Sem janela de 24h — o
 * gateway se comporta como um WhatsApp normal. O guard de sandbox já
 * rodou antes em sendText().
 */
async function sendViaUnofficial(
  input: {
    conversationId: string;
    organizationId: string;
    text: string;
    aiGenerated?: boolean;
  },
  contact: { phone: string; kind: string },
  unofficialChannelId: string | null
): Promise<SendResult> {
  const db = getDb();
  const target =
    contact.kind === "group"
      ? `${contact.phone}@g.us`
      : normalizeRecipient(contact.phone);

  const channelId = await resolveOutboundChannelId(
    input.organizationId,
    unofficialChannelId
  );
  if (!channelId) {
    throw new SendError(
      "not_connected",
      "Não há WhatsApp Web conectado: confira Configurações → Canais"
    );
  }

  let providerMessageId: string;
  try {
    providerMessageId = await sendBaileysText(channelId, target, input.text);
  } catch (err) {
    if (err instanceof BaileysSendError) {
      if (err.code === "not_connected") {
        throw new SendError(
          "not_connected",
          "Não há WhatsApp Web conectado: confira Configurações → Canais"
        );
      }
      if (err.code === "recipient_not_found") {
        throw new SendError("recipient_not_found", err.message);
      }
      throw new SendError("meta_unavailable", err.message);
    }
    throw err;
  }

  const waMessageId = baileysMessageId(providerMessageId);
  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      waMessageId,
      direction: "out",
      type: "text",
      text: input.text,
      status: "sent",
      aiGenerated: input.aiGenerated ?? false,
    })
    .onConflictDoNothing({ target: [schema.message.waMessageId] })
    .returning();
  const message = inserted[0];

  await db
    .update(schema.conversation)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.conversation.id, input.conversationId));

  if (message) {
    publish(input.organizationId, {
      type: "message.new",
      data: {
        conversationId: input.conversationId,
        message: serializeMessage(message),
      },
    });
    return { messageId: message.id };
  }
  // O próprio eco do socket chegou antes de nós (corrida benigna).
  return { messageId: waMessageId };
}

/** Chama Graph /messages e traduz erros da Meta para SendError. */
export async function callGraphSend(
  credentials: Credentials,
  payload: unknown
): Promise<string> {
  try {
    const res = await graphRequest<{ messages?: { id: string }[] }>(
      `${credentials.phoneNumberId}/messages`,
      { method: "POST", token: credentials.token, body: payload }
    );
    const id = res.messages?.[0]?.id;
    if (!id) throw new SendError("meta_error", "A Meta não devolveu o ID da mensagem");
    return id;
  } catch (err) {
    if (err instanceof MetaApiError) {
      if (err.isAuthError) {
        await markReconnectRequired(credentials.id);
        throw new SendError(
          "reconnect_required",
          "O token do WhatsApp expirou: reconecte o número em Configurações"
        );
      }
      if (err.status === 0 || err.status >= 500) {
        throw new SendError("meta_unavailable", "A Meta não está disponível agora");
      }
      throw new SendError("meta_error", err.message);
    }
    throw err;
  }
}
