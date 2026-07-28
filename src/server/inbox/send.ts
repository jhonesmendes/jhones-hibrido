import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { graphRequest, MetaApiError, normalizeRecipient } from "@/lib/meta/client";
import { publish } from "@/server/events/bus";
import {
  getCredentialsByOrg,
  markReconnectRequired,
  type Credentials,
} from "@/server/whatsapp/credentials";
import { isWindowOpen } from "@/server/inbox/window";
import { serializeMessage } from "@/server/inbox/ingest";
import { BaileysSendError, sendText as sendBaileysText } from "@/server/baileys/sender";
import { baileysMessageId } from "@/server/baileys/inbound";

/** Error tipado del envío; `code` mapea a HTTP en la capa de API. */
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

/**
 * Envía un mensaje de texto libre por WhatsApp.
 *
 * ASERCIÓN DURA (FR-031): una conversación de prueba del Laboratorio jamás
 * llega a la API real — se lanza ANTES de tocar credenciales o red.
 */
export async function sendText(input: {
  conversationId: string;
  organizationId: string;
  text: string;
  aiGenerated?: boolean;
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

  // Ruteo por canal: la conversación sigue el canal del último entrante.
  if (row.conversation.channel === "unofficial") {
    return sendViaUnofficial(input, row.contact.phone);
  }

  if (!isWindowOpen(row.conversation.lastInboundAt)) {
    throw new SendError(
      "window_closed",
      "A janela de 24 horas está fechada; use um modelo aprovado"
    );
  }

  const credentials = await getCredentialsByOrg(input.organizationId);
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
 * Envío por el canal NO oficial (gateway). Sin ventana de 24h — el
 * gateway se comporta como un WhatsApp normal. El guard de sandbox ya
 * corrió antes en sendText().
 */
async function sendViaUnofficial(
  input: {
    conversationId: string;
    organizationId: string;
    text: string;
    aiGenerated?: boolean;
  },
  contactPhone: string
): Promise<SendResult> {
  const db = getDb();

  let providerMessageId: string;
  try {
    providerMessageId = await sendBaileysText(
      input.organizationId,
      normalizeRecipient(contactPhone),
      input.text
    );
  } catch (err) {
    if (err instanceof BaileysSendError) {
      if (err.code === "not_connected") {
        throw new SendError(
          "not_connected",
          "Não há canal não oficial conectado: confira Configurações → Canal não oficial"
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
  // El propio eco del socket llegó antes que nosotros (carrera benigna).
  return { messageId: waMessageId };
}

/** Llama a Graph /messages y traduce errores de Meta a SendError. */
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
        await markReconnectRequired(credentials.organizationId);
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
