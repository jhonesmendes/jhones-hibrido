// src/app/api/internal/send-template/route.ts
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { resolveInternalCaller } from "@/server/integrations/internal-auth";
import { callGraphSend, SendError } from "@/server/inbox/send";
import { normalizeRecipient } from "@/lib/meta/client";
import { getCredentialsByOrg } from "@/server/whatsapp/credentials";

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 20);
const genId = (prefix: string) => `${prefix}_${nanoid()}`;

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().trim().min(1),
  templateId: z.string().trim().min(1),
  variables: z.array(z.string()).optional().default([]),
});

const SEND_ERROR_STATUS: Record<SendError["code"], number> = {
  sandbox_violation:   403,
  not_connected:       409,
  recipient_not_found: 404,
  reconnect_required:  409,
  window_closed:       422,
  meta_error:          422,
  meta_unavailable:    503,
};

export async function POST(req: Request) {
  const caller = await resolveInternalCaller(req);
  if (caller instanceof Response) return caller;
  const { organizationId } = caller;

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    const msg = body.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    return apiError(422, "invalid_body", msg);
  }

  const { conversationId, templateId, variables } = body.data;
  const db = getDb();

  const convRow = await db
    .select({
      id:             schema.conversation.id,
      organizationId: schema.conversation.organizationId,
      contactId:      schema.conversation.contactId,
      isTest:         schema.conversation.isTest,
      contactPhone:   schema.contact.phone,
    })
    .from(schema.conversation)
    .innerJoin(
      schema.contact,
      eq(schema.conversation.contactId, schema.contact.id)
    )
    .where(
      and(
        eq(schema.conversation.id, conversationId),
        eq(schema.conversation.organizationId, organizationId)
      )
    )
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!convRow) return apiError(404, "not_found", "Conversa não encontrada");
  if (convRow.isTest) return apiError(403, "sandbox_violation", "Conversa de teste: envio real proibido");

  const tplRow = await db
    .select({
      id:       schema.template.id,
      name:     schema.template.name,
      language: schema.template.language,
      body:     schema.template.body,
      status:   schema.template.status,
    })
    .from(schema.template)
    .where(
      and(
        eq(schema.template.id, templateId),
        eq(schema.template.organizationId, organizationId)
      )
    )
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!tplRow) return apiError(404, "not_found", "Template não encontrado");
  if (tplRow.status !== "approved") return apiError(422, "invalid", "Só é possível enviar templates aprovados");

  const creds = await getCredentialsByOrg(organizationId);
  if (!creds) return apiError(409, "not_connected", "Nenhum número oficial conectado");
  if (creds.status === "reconnect_required") return apiError(409, "reconnect_required", "O número oficial precisa ser reconectado");

  const varCount = countTemplateVariables(tplRow.body);
  const components =
    varCount > 0
      ? [{ type: "body", parameters: Array.from({ length: varCount }, (_, i) => ({ type: "text", text: (variables[i] ?? "").trim() })) }]
      : undefined;

  const resolvedText = resolveTemplateText(tplRow.body, variables);

  try {
    const messageId = await callGraphSend(creds, {
      messaging_product: "whatsapp",
      to: normalizeRecipient(convRow.contactPhone),
      type: "template",
      template: {
        name: tplRow.name,
        language: { code: tplRow.language },
        ...(components ? { components } : {}),
      },
    });

    await db.insert(schema.message).values({
      id:           genId("msg"),
      organizationId,
      conversationId,
      waMessageId:  messageId,
      direction:    "out",
      type:         "template",
      text:         resolvedText,
      status:       "sent",
      aiGenerated:  false,
      metaCategory: "utility",
      createdAt:    new Date(),
    });

    return Response.json({ success: true, messageId });
  } catch (err) {
    if (err instanceof SendError) {
      return apiError(SEND_ERROR_STATUS[err.code], err.code, err.message);
    }
    throw err;
  }
}

function countTemplateVariables(body: string): number {
  const matches = body.match(/\{\{\d+\}\}/g) ?? [];
  return matches.reduce((max, m) => {
    const n = Number(m.replace(/\D/g, ""));
    return Math.max(max, n);
  }, 0);
}

function resolveTemplateText(body: string, variables: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => variables[Number(n) - 1] ?? "");
}   