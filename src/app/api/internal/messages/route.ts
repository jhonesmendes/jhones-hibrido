import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { normalizePhoneInput } from "@/lib/utils";
import {
  getOrCreateContact,
  getOrCreateConversation,
  resolveDefaultChannelForNewConversation,
} from "@/server/inbox/ingest";
import { getConversation, getMostRecentConversationForContact } from "@/server/inbox/queries";
import { sendMedia, sendText, SendError } from "@/server/inbox/send";
import { resolveInternalCaller } from "@/server/integrations/internal-auth";
import { sendTemplate, templateErrorStatus, TemplateError } from "@/server/whatsapp/templates";

export const dynamic = "force-dynamic";

/**
 * Envio pela automação (n8n, ERP) que GRAVA no CRM: cria contato/conversa
 * se preciso, respeita a janela de 24h e o canal da conversa, e a mensagem
 * aparece na Caixa de Entrada — diferente de `/api/internal/send-message`,
 * que é só um repasse à Meta sem nenhum registro.
 */
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil((MAX_MEDIA_BYTES * 4) / 3) + 1024;

const bodySchema = z
  .object({
    conversationId: z.string().trim().min(1).optional(),
    to: z.string().trim().min(8).max(25).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    text: z.string().trim().min(1).max(4096).optional(),
    template: z
      .object({
        name: z.string().trim().min(1),
        language: z.string().trim().min(1).optional(),
        variables: z.array(z.string()).optional(),
      })
      .optional(),
    media: z
      .object({
        dataBase64: z.string().min(1).max(MAX_BASE64_LENGTH),
        mimeType: z.string().trim().min(1),
        filename: z.string().trim().min(1).optional(),
        caption: z.string().trim().min(1).max(1024).optional(),
      })
      .optional(),
    replyToMessageId: z.string().trim().min(1).optional(),
  })
  .refine((b) => Boolean(b.conversationId) !== Boolean(b.to), {
    message: "Informe conversationId OU to",
  })
  .refine((b) => [b.text, b.template, b.media].filter(Boolean).length === 1, {
    message: "Informe exatamente um entre text, template e media",
  });

const SEND_ERROR_STATUS: Record<SendError["code"], number> = {
  sandbox_violation: 403,
  not_connected: 409,
  recipient_not_found: 404,
  reconnect_required: 409,
  window_closed: 422,
  meta_error: 422,
  meta_unavailable: 503,
};

export async function POST(req: Request) {
  const caller = await resolveInternalCaller(req);
  if (caller instanceof Response) return caller;
  const { organizationId } = caller;

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const input = body.data;

  let conversationId: string;
  let contactId: string;
  if (input.conversationId) {
    const row = await getConversation(organizationId, input.conversationId);
    if (!row) return apiError(404, "not_found", "Conversa não encontrada");
    conversationId = row.conversation.id;
    contactId = row.contact.id;
  } else {
    const phone = normalizePhoneInput(input.to!);
    if (!phone) return apiError(422, "invalid_phone", "Telefone inválido — use DDI + DDD + número");
    const { contact } = await getOrCreateContact(organizationId, phone, input.name ?? null);
    contactId = contact.id;
    let conversation = await getMostRecentConversationForContact(organizationId, contact.id);
    if (!conversation) {
      const channel = await resolveDefaultChannelForNewConversation(organizationId);
      if (!channel) return apiError(409, "not_connected", "Nenhum canal de WhatsApp conectado");
      conversation = await getOrCreateConversation(organizationId, contact.id, channel);
    }
    conversationId = conversation.id;
  }

  try {
    let messageId: string;
    if (input.text) {
      ({ messageId } = await sendText({
        conversationId,
        organizationId,
        text: input.text,
        replyToMessageId: input.replyToMessageId ?? null,
      }));
    } else if (input.media) {
      const buffer = Buffer.from(input.media.dataBase64, "base64");
      if (buffer.length === 0 || buffer.length > MAX_MEDIA_BYTES) {
        return apiError(422, "invalid", "Arquivo vazio ou maior que o permitido (16MB)");
      }
      ({ messageId } = await sendMedia({
        conversationId,
        organizationId,
        buffer,
        mimeType: input.media.mimeType,
        filename: input.media.filename ?? null,
        caption: input.media.caption,
        replyToMessageId: input.replyToMessageId ?? null,
      }));
    } else {
      const { name, language, variables } = input.template!;
      const templates = await getDb()
        .select({ id: schema.template.id })
        .from(schema.template)
        .where(
          and(
            eq(schema.template.organizationId, organizationId),
            eq(schema.template.name, name),
            eq(schema.template.status, "approved"),
            language ? eq(schema.template.language, language) : undefined
          )
        )
        .limit(1);
      if (!templates[0]) {
        return apiError(404, "template_not_found", "Modelo aprovado não encontrado com esse nome");
      }
      ({ messageId } = await sendTemplate({
        conversationId,
        organizationId,
        templateId: templates[0].id,
        variables,
      }));
    }
    return Response.json({ success: true, messageId, conversationId, contactId }, { status: 201 });
  } catch (err) {
    if (err instanceof SendError) {
      return apiError(SEND_ERROR_STATUS[err.code], err.code, err.message);
    }
    if (err instanceof TemplateError) {
      return apiError(templateErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
}
