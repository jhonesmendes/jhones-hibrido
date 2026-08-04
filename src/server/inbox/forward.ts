import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { SessionContext } from "@/lib/auth/session";
import { requireChannelAccess } from "@/lib/auth/require-permission";
import {
  getOrCreateConversation,
  resolveDefaultChannelForNewConversation,
} from "@/server/inbox/ingest";
import { getMostRecentConversationForContact } from "@/server/inbox/queries";
import { sendMedia, sendText, SendError } from "@/server/inbox/send";

export type ForwardResult = { contactId: string; ok: boolean; error?: string };

/**
 * Encaminha uma mensagem (texto ou mídia) já existente para outros contatos.
 * Reusa sendText/sendMedia — mesmas regras de sandbox/janela/canal de um
 * envio normal — e verifica a permissão de canal por destino resolvido
 * (contatos diferentes podem cair em conversas com canais diferentes).
 */
export async function forwardMessage(
  session: SessionContext,
  input: {
    messageId: string;
    targetContactIds: string[];
    caption?: string;
  }
): Promise<ForwardResult[]> {
  const db = getDb();

  const rows = await db
    .select({ message: schema.message, media: schema.messageMedia })
    .from(schema.message)
    .leftJoin(
      schema.messageMedia,
      eq(schema.messageMedia.messageId, schema.message.id)
    )
    .where(
      scoped(
        schema.message.organizationId,
        session.organizationId,
        eq(schema.message.id, input.messageId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new SendError("meta_error", "Mensagem não encontrada");

  const results: ForwardResult[] = [];
  for (const contactId of input.targetContactIds) {
    try {
      const contactRows = await db
        .select()
        .from(schema.contact)
        .where(
          scoped(
            schema.contact.organizationId,
            session.organizationId,
            eq(schema.contact.id, contactId)
          )
        )
        .limit(1);
      const contact = contactRows[0];
      if (!contact) throw new SendError("meta_error", "Contato não encontrado");

      let conversation = await getMostRecentConversationForContact(
        session.organizationId,
        contact.id
      );
      if (!conversation) {
        const channel = await resolveDefaultChannelForNewConversation(session.organizationId);
        if (!channel) {
          throw new SendError("not_connected", "Nenhum canal de WhatsApp conectado");
        }
        conversation = await getOrCreateConversation(session.organizationId, contact.id, channel);
      }
      await requireChannelAccess(session, conversation.channel, "send");

      if (row.media) {
        await sendMedia({
          conversationId: conversation.id,
          organizationId: session.organizationId,
          buffer: Buffer.from(row.media.dataBase64, "base64"),
          mimeType: row.media.mimeType,
          filename: row.media.filename,
          caption: input.caption?.trim() || row.message.text || undefined,
        });
      } else {
        const text = input.caption?.trim()
          ? `${input.caption.trim()}\n\n${row.message.text ?? ""}`.trim()
          : (row.message.text ?? "");
        if (!text) {
          throw new SendError("meta_error", "Mensagem sem conteúdo para encaminhar");
        }
        await sendText({
          conversationId: conversation.id,
          organizationId: session.organizationId,
          text,
        });
      }
      results.push({ contactId, ok: true });
    } catch (err) {
      results.push({
        contactId,
        ok: false,
        error: err instanceof Error ? err.message : "Falha ao encaminhar",
      });
    }
  }
  return results;
}
