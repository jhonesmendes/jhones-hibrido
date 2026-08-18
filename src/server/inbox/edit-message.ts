import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { publish } from "@/server/events/bus";
import { editText as editBaileysText, BaileysSendError } from "@/server/baileys/sender";
import { rawBaileysId } from "@/server/baileys/inbound";
import { normalizeRecipient } from "@/lib/meta/client";
import { resolveDefaultUnofficialChannelId } from "@/server/settings/unofficial-channels";
import { serializeMessage } from "@/server/inbox/message-format";
import { getMemberName } from "@/server/inbox/queries";

/** Mesma janela que o WhatsApp aplica no próprio app — o Baileys não
 * valida isso, então quem não checar aqui deixaria o operador editar uma
 * mensagem de dias atrás sem avisar que o destinatário nunca vai ver a
 * edição (o WhatsApp do cliente rejeita silenciosamente fora da janela). */
const EDIT_WINDOW_MS = 15 * 60 * 1000;

export class EditMessageError extends Error {
  code: "not_found" | "not_editable" | "expired" | "not_connected" | "failed";
  constructor(code: EditMessageError["code"], message: string) {
    super(message);
    this.name = "EditMessageError";
    this.code = code;
  }
}

/**
 * Edita o texto de uma mensagem de SAÍDA já enviada pelo canal não oficial
 * (WhatsApp Web/Baileys) — a Cloud API oficial da Meta não suporta editar
 * mensagem enviada (limitação documentada da própria Meta, não do
 * produto); mensagens do canal oficial lançam `not_editable` aqui.
 */
export async function editMessage(input: {
  organizationId: string;
  messageId: string;
  newText: string;
}): Promise<ReturnType<typeof serializeMessage>> {
  const db = getDb();

  const rows = await db
    .select({ message: schema.message, contact: schema.contact, conversation: schema.conversation })
    .from(schema.message)
    .innerJoin(schema.conversation, eq(schema.conversation.id, schema.message.conversationId))
    .innerJoin(schema.contact, eq(schema.contact.id, schema.conversation.contactId))
    .where(eq(schema.message.id, input.messageId))
    .limit(1);
  const row = rows[0];
  if (!row || row.message.organizationId !== input.organizationId) {
    throw new EditMessageError("not_found", "Mensagem não encontrada");
  }
  const { message, contact, conversation } = row;

  if (message.direction !== "out" || message.type !== "text" || !message.waMessageId) {
    throw new EditMessageError("not_editable", "Só é possível editar mensagens de texto enviadas por aqui");
  }
  const rawId = rawBaileysId(message.waMessageId);
  if (!rawId) {
    throw new EditMessageError(
      "not_editable",
      "Mensagens do WhatsApp Cloud API oficial não podem ser editadas — é uma limitação da própria Meta, não suportada pela API"
    );
  }
  if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
    throw new EditMessageError(
      "expired",
      "A janela de 15 minutos para editar esta mensagem já fechou"
    );
  }

  const channelId = conversation.unofficialChannelId
    ? conversation.unofficialChannelId
    : await resolveDefaultUnofficialChannelId(input.organizationId);
  if (!channelId) {
    throw new EditMessageError("not_connected", "Não há WhatsApp Web conectado");
  }
  const target =
    contact.kind === "group" ? `${contact.phone}@g.us` : normalizeRecipient(contact.phone);

  try {
    await editBaileysText(channelId, target, rawId, input.newText);
  } catch (err) {
    if (err instanceof BaileysSendError) {
      throw new EditMessageError(
        err.code === "not_connected" ? "not_connected" : "failed",
        err.message
      );
    }
    throw err;
  }

  const now = new Date();
  const updated = await db
    .update(schema.message)
    .set({ text: input.newText, editedAt: now })
    .where(eq(schema.message.id, input.messageId))
    .returning();
  const updatedMessage = updated[0]!;

  const dto = serializeMessage(
    updatedMessage,
    null,
    message.sentByMemberId ? await getMemberName(message.sentByMemberId) : null
  );

  publish(input.organizationId, {
    type: "message.updated",
    data: { conversationId: conversation.id, message: dto },
  });

  return dto;
}
