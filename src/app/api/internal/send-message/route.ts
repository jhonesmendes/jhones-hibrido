// src/app/api/internal/send-template/route.ts
//
// Rota interna para disparar um template Meta aprovado a partir de um
// conversationId existente. Usada pelo N8N para recobrança de follow-ups
// sem resposta.
//
// POST /api/internal/send-template
// Headers: x-internal-key: <INTERNAL_API_KEY>
// Body:
//   {
//     "conversationId": "cv_...",   // conversa existente do lead
//     "templateId":     "tpl_...",  // ID interno do template (tabela template)
//     "variables":      ["valor1"]  // array posicional — 1 item por {{N}} no body (pode ser [])
//   }
//
// Resposta 200: { success: true, messageId: "<wa_message_id>" }

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { verifyApiKey } from "@/server/integrations/api-keys";
import { callGraphSend, SendError } from "@/server/inbox/send";
import { normalizeRecipient } from "@/lib/meta/client";
import { getCredentialsByOrg } from "@/server/whatsapp/credentials";

export const dynamic = "force-dynamic";

// ── Autenticação (mesmo padrão de send-message/route.ts) ─────────────────────

async function resolveCaller(
  req: Request
): Promise<{ organizationId: string } | Response> {
  const header = req.headers.get("x-internal-key") ?? "";
  if (!header) return apiError(401, "unauthorized", "Chave inválida");

  const viaApiKey = await verifyApiKey(header);
  if (viaApiKey) return { organizationId: viaApiKey.organizationId };

  const env = getEnv();
  if (env.INTERNAL_API_KEY) {
    const expected = Buffer.from(env.INTERNAL_API_KEY);
    const got = Buffer.from(header);
    if (got.length === expected.length && timingSafeEqual(got, expected)) {
      const organizationId = await getInstanceOrganizationId();
      if (organizationId) return { organizationId };
    }
  }

  return apiError(401, "unauthorized", "Chave inválida");
}

async function getInstanceOrganizationId(): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .orderBy(schema.organization.createdAt)
    .limit(1);
  return rows[0]?.id ?? null;
}

// ── Schema do body ────────────────────────────────────────────────────────────

const bodySchema = z.object({
  conversationId: z.string().trim().min(1),
  templateId: z.string().trim().min(1),
  variables: z.array(z.string()).optional().default([]),
});

// ── Mapa de status HTTP para erros conhecidos do callGraphSend ────────────────

const SEND_ERROR_STATUS: Record<SendError["code"], number> = {
  sandbox_violation:   403,
  not_connected:       409,
  recipient_not_found: 404,
  reconnect_required:  409,
  window_closed:       422,
  meta_error:          422,
  meta_unavailable:    503,
};

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // 1. Autenticação
  const caller = await resolveCaller(req);
  if (caller instanceof Response) return caller;
  const { organizationId } = caller;

  // 2. Parse do body
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    const msg = body.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    return apiError(422, "invalid_body", msg);
  }

  const { conversationId, templateId, variables } = body.data;
  const db = getDb();

  // 3. Busca conversa + contato (precisa do phone para o "to")
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

  if (!convRow) {
    return apiError(404, "not_found", "Conversa não encontrada");
  }
  if (convRow.isTest) {
    return apiError(403, "sandbox_violation", "Conversa de teste: envio real proibido");
  }

  // 4. Busca o template
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

  if (!tplRow) {
    return apiError(404, "not_found", "Template não encontrado");
  }
  if (tplRow.status !== "approved") {
    return apiError(422, "invalid", "Só é possível enviar templates aprovados");
  }

  // 5. Resolve credencial Meta com token já decriptado (via getCredentialsByOrg,
  //    que usa o mesmo fluxo de send-message e internamente descriptografa o token)
  const creds = await getCredentialsByOrg(organizationId);
  if (!creds) {
    return apiError(409, "not_connected", "Nenhum número oficial conectado");
  }
  if (creds.status === "reconnect_required") {
    return apiError(409, "reconnect_required", "O número oficial precisa ser reconectado");
  }

  // 6. Monta o payload do template para a Graph API
  //    Conta variáveis {{N}} no body do template
  const varCount = countTemplateVariables(tplRow.body);
  const components =
    varCount > 0
      ? [
          {
            type: "body",
            parameters: Array.from({ length: varCount }, (_, i) => ({
              type: "text",
              text: (variables[i] ?? "").trim(),
            })),
          },
        ]
      : undefined;

  // 7. Dispara via callGraphSend (mesmo helper usado em send-message)
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

    return Response.json({ success: true, messageId });
  } catch (err) {
    if (err instanceof SendError) {
      return apiError(SEND_ERROR_STATUS[err.code], err.code, err.message);
    }
    throw err;
  }
}

/** Conta quantas variáveis {{N}} existem no body do template. */
function countTemplateVariables(body: string): number {
  const matches = body.match(/\{\{\d+\}\}/g) ?? [];
  return matches.reduce((max, m) => {
    const n = Number(m.replace(/\D/g, ""));
    return Math.max(max, n);
  }, 0);
}