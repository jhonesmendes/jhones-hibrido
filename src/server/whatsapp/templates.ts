import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { graphRequest, MetaApiError, normalizeRecipient } from "@/lib/meta/client";
import { scoped } from "@/lib/db/tenant";
import { publish } from "@/server/events/bus";
import {
  getCredentialsByOrg,
  getCredentialsByWabaId,
  markReconnectRequired,
} from "@/server/whatsapp/credentials";
import { callGraphSend, SendError } from "@/server/inbox/send";
import { serializeMessage } from "@/server/inbox/ingest";
import type { WebhookValue } from "@/server/inbox/webhook";

/** Erros tipados do serviço de modelos → HTTP na camada de API. */
export class TemplateError extends Error {
  code:
    | "not_connected"
    | "reconnect_required"
    | "invalid"
    | "not_found"
    | "meta_error"
    | "meta_unavailable";

  constructor(code: TemplateError["code"], message: string) {
    super(message);
    this.name = "TemplateError";
    this.code = code;
  }
}

const TEMPLATE_ERROR_STATUS: Record<TemplateError["code"], number> = {
  not_connected: 409,
  reconnect_required: 409,
  invalid: 422,
  not_found: 404,
  meta_error: 422,
  meta_unavailable: 503,
};

export function templateErrorStatus(err: TemplateError): number {
  return TEMPLATE_ERROR_STATUS[err.code];
}

const VARIABLE_REGEX = /\{\{\s*(\d+)\s*\}\}/g;

/** Quantidade de variáveis {{n}} no corpo — o maior índice usado (ex.: só {{2}} conta como 2, mas é inválido: ver validateBodyVariables). */
export function countVariables(body: string): number {
  const matches = [...body.matchAll(VARIABLE_REGEX)];
  if (matches.length === 0) return 0;
  return Math.max(...matches.map((m) => Number(m[1])));
}

/** Variáveis MUST ser sequenciais a partir de {{1}}, sem buracos nem repetição de índice. */
export function validateBodyVariables(body: string): string | null {
  const matches = [...body.matchAll(VARIABLE_REGEX)];
  const indices = [...new Set(matches.map((m) => Number(m[1])))].sort((a, b) => a - b);
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== i + 1) {
      return "As variáveis devem ser sequenciais a partir de {{1}} (ex.: {{1}}, {{2}}, {{3}}…), sem pular números";
    }
  }
  return null;
}

/** Substitui {{1}}, {{2}}… pelos valores correspondentes, na ordem. */
export function renderBody(body: string, variables: string[] = []): string {
  return body.replace(VARIABLE_REGEX, (_, idx: string) => variables[Number(idx) - 1] ?? "");
}

type TemplateRow = typeof schema.template.$inferSelect;

export function serializeTemplate(t: TemplateRow) {
  return {
    id: t.id,
    name: t.name,
    language: t.language,
    category: t.category,
    body: t.body,
    status: t.status,
    rejectionReason: t.rejectionReason,
  };
}

/** Cria o modelo e o envia para aprovação da Meta (FR-050). */
export async function createTemplate(
  organizationId: string,
  input: { name: string; language: string; category: string; body: string }
): Promise<TemplateRow> {
  const variableError = validateBodyVariables(input.body);
  if (variableError) throw new TemplateError("invalid", variableError);

  const creds = await getCredentialsByOrg(organizationId);
  if (!creds) {
    throw new TemplateError("not_connected", "Conecte seu número de WhatsApp primeiro");
  }
  if (creds.status === "reconnect_required") {
    throw new TemplateError("reconnect_required", "Reconecte seu número antes de criar modelos");
  }

  const name = input.name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  if (!name) throw new TemplateError("invalid", "Nome de modelo inválido");

  const hasVariable = countVariables(input.body) === 1;
  let waTemplateId: string | null = null;
  try {
    const res = await graphRequest<{ id?: string; status?: string }>(
      `${creds.wabaId}/message_templates`,
      {
        method: "POST",
        token: creds.token,
        body: {
          name,
          language: input.language,
          category: input.category,
          components: [
            {
              type: "BODY",
              text: input.body,
              ...(hasVariable
                ? { example: { body_text: [["exemplo"]] } }
                : {}),
            },
          ],
        },
      }
    );
    waTemplateId = res.id ?? null;
  } catch (err) {
    if (err instanceof MetaApiError) {
      if (err.isAuthError) {
        await markReconnectRequired(creds.id, { source: "createTemplate", err });
        throw new TemplateError("reconnect_required", "O token expirou: reconecte o número");
      }
      if (err.status === 0 || err.status >= 500) {
        throw new TemplateError("meta_unavailable", "A Meta não está disponível agora");
      }
      throw new TemplateError("meta_error", err.message);
    }
    throw err;
  }

  const db = getDb();
  const inserted = await db
    .insert(schema.template)
    .values({
      id: newId("template"),
      organizationId,
      name,
      language: input.language,
      category: input.category,
      body: input.body,
      status: "pending",
      waTemplateId,
    })
    .onConflictDoUpdate({
      target: [
        schema.template.organizationId,
        schema.template.name,
        schema.template.language,
      ],
      set: {
        category: input.category,
        body: input.body,
        status: "pending",
        rejectionReason: null,
        waTemplateId,
        updatedAt: new Date(),
      },
    })
    .returning();
  return inserted[0]!;
}

/**
 * Edita um modelo existente (nome/idioma são fixos na Meta — só categoria e
 * corpo mudam) e reenvia pra revisão. Único jeito de tentar aprovação de
 * novo depois de rejeitado, sem precisar apagar e recriar do zero.
 */
export async function updateTemplate(
  organizationId: string,
  templateId: string,
  input: { category: string; body: string }
): Promise<TemplateRow> {
  const variableError = validateBodyVariables(input.body);
  if (variableError) throw new TemplateError("invalid", variableError);

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.template)
    .where(
      scoped(
        schema.template.organizationId,
        organizationId,
        eq(schema.template.id, templateId)
      )
    )
    .limit(1);
  const template = rows[0];
  if (!template) throw new TemplateError("not_found", "Modelo não encontrado");
  if (!template.waTemplateId) {
    throw new TemplateError("invalid", "Modelo sem ID na Meta — sincronize antes de editar");
  }

  const creds = await getCredentialsByOrg(organizationId);
  if (!creds) throw new TemplateError("not_connected", "Conecte seu número de WhatsApp primeiro");
  if (creds.status === "reconnect_required") {
    throw new TemplateError("reconnect_required", "Reconecte seu número antes de editar modelos");
  }

  const hasVariable = countVariables(input.body) === 1;
  try {
    await graphRequest(template.waTemplateId, {
      method: "POST",
      token: creds.token,
      body: {
        category: input.category,
        components: [
          {
            type: "BODY",
            text: input.body,
            ...(hasVariable ? { example: { body_text: [["exemplo"]] } } : {}),
          },
        ],
      },
    });
  } catch (err) {
    if (err instanceof MetaApiError) {
      if (err.isAuthError) {
        await markReconnectRequired(creds.id, { source: "updateTemplate", err });
        throw new TemplateError("reconnect_required", "O token expirou: reconecte o número");
      }
      if (err.status === 0 || err.status >= 500) {
        throw new TemplateError("meta_unavailable", "A Meta não está disponível agora");
      }
      throw new TemplateError("meta_error", err.message);
    }
    throw err;
  }

  const updated = await db
    .update(schema.template)
    .set({
      category: input.category,
      body: input.body,
      status: "pending",
      rejectionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.template.id, templateId))
    .returning();
  return updated[0]!;
}

/** Remove o modelo na Meta e localmente. Mensagens antigas que usaram esse
 * modelo já têm o texto renderizado gravado — apagar o registro não afeta
 * o histórico. */
export async function deleteTemplate(
  organizationId: string,
  templateId: string
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.template)
    .where(
      scoped(
        schema.template.organizationId,
        organizationId,
        eq(schema.template.id, templateId)
      )
    )
    .limit(1);
  const template = rows[0];
  if (!template) throw new TemplateError("not_found", "Modelo não encontrado");

  const creds = await getCredentialsByOrg(organizationId);
  if (creds && creds.status !== "reconnect_required") {
    try {
      const query = template.waTemplateId
        ? `name=${encodeURIComponent(template.name)}&hsm_id=${encodeURIComponent(template.waTemplateId)}`
        : `name=${encodeURIComponent(template.name)}`;
      await graphRequest(`${creds.wabaId}/message_templates?${query}`, {
        method: "DELETE",
        token: creds.token,
      });
    } catch (err) {
      // Já sumiu na Meta (ex.: apagado por lá antes) não deve travar a
      // limpeza local — qualquer outro erro real, sim.
      if (err instanceof MetaApiError && err.status !== 404) throw err;
    }
  }

  try {
    await db.delete(schema.template).where(eq(schema.template.id, templateId));
  } catch (err) {
    // 23503 = violação de chave estrangeira (ex.: usado numa campanha) —
    // o modelo já foi apagado na Meta acima, então avisa claro em vez de
    // deixar o erro cru do Postgres subir.
    if (err && typeof err === "object" && "code" in err && err.code === "23503") {
      throw new TemplateError(
        "invalid",
        "Este modelo está em uso numa campanha — remova a campanha antes de excluir"
      );
    }
    throw err;
  }
}

function mapMetaStatus(
  status: string | undefined
): TemplateRow["status"] | null {
  const s = (status ?? "").toUpperCase();
  if (s === "APPROVED") return "approved";
  if (s === "REJECTED") return "rejected";
  if (s === "PENDING" || s === "IN_APPEAL" || s === "PENDING_DELETION") {
    return "pending";
  }
  return null;
}

/**
 * Sincroniza estados a partir do Graph (`GET {waba}/message_templates`).
 * Cobre o modo agência: os webhooks de modelos NÃO seguem o override de
 * callback, então o pull é a via universal (DV-VC-04/DV-VC-15).
 */
export async function syncTemplates(organizationId: string): Promise<number> {
  const creds = await getCredentialsByOrg(organizationId);
  if (!creds) {
    throw new TemplateError("not_connected", "Conecte seu número de WhatsApp primeiro");
  }

  let data: {
    data?: { id?: string; name?: string; language?: string; status?: string; quality_score?: unknown; rejected_reason?: string }[];
  };
  try {
    data = await graphRequest(`${creds.wabaId}/message_templates`, {
      token: creds.token,
    });
  } catch (err) {
    if (err instanceof MetaApiError) {
      if (err.isAuthError) {
        await markReconnectRequired(creds.id, { source: "syncTemplates", err });
        throw new TemplateError("reconnect_required", "O token expirou: reconecte o número");
      }
      throw new TemplateError("meta_unavailable", "Não foi possível consultar a Meta");
    }
    throw err;
  }

  const db = getDb();
  const local = await db
    .select()
    .from(schema.template)
    .where(scoped(schema.template.organizationId, organizationId));

  let updated = 0;
  for (const remote of data.data ?? []) {
    const status = mapMetaStatus(remote.status);
    if (!status) continue;
    const match = local.find(
      (t) =>
        (remote.id && t.waTemplateId === remote.id) ||
        (t.name === remote.name && t.language === remote.language)
    );
    if (!match || match.status === status) continue;
    await db
      .update(schema.template)
      .set({
        status,
        rejectionReason: remote.rejected_reason ?? null,
        waTemplateId: match.waTemplateId ?? remote.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.template.id, match.id));
    updated += 1;
  }
  return updated;
}

/** Evento webhook `message_template_status_update` (modo direto, FR-050). */
export async function applyTemplateStatusEvent(
  wabaId: string | null,
  value: WebhookValue
): Promise<void> {
  if (!wabaId) return;
  const creds = await getCredentialsByWabaId(wabaId);
  if (!creds) return;

  const status = mapMetaStatus(value.event);
  const name = value.message_template_name;
  const language = value.message_template_language;
  if (!status || !name || !language) return;

  const db = getDb();
  await db
    .update(schema.template)
    .set({
      status,
      rejectionReason: status === "rejected" ? (value.reason ?? null) : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.template.organizationId, creds.organizationId),
        eq(schema.template.name, name),
        eq(schema.template.language, language)
      )
    );
}

/** Envia um modelo APROVADO a uma conversa (janela fechada, FR-051). */
export async function sendTemplate(input: {
  organizationId: string;
  conversationId: string;
  templateId: string;
  /** Ordenadas: índice 0 = {{1}}, índice 1 = {{2}}, etc. */
  variables?: string[];
}): Promise<{ messageId: string }> {
  const db = getDb();

  const templates = await db
    .select()
    .from(schema.template)
    .where(
      scoped(
        schema.template.organizationId,
        input.organizationId,
        eq(schema.template.id, input.templateId)
      )
    )
    .limit(1);
  const template = templates[0];
  if (!template) throw new TemplateError("not_found", "Modelo não encontrado");
  if (template.status !== "approved") {
    throw new TemplateError("invalid", "Só é possível enviar modelos aprovados");
  }
  const variableCount = countVariables(template.body);
  const variables = input.variables ?? [];
  if (
    variableCount > 0 &&
    variables.slice(0, variableCount).some((v) => !v?.trim())
  ) {
    throw new TemplateError(
      "invalid",
      variableCount === 1
        ? "O modelo requer o valor de {{1}}"
        : `O modelo requer o valor de {{1}} a {{${variableCount}}}`
    );
  }

  const rows = await db
    .select({ conversation: schema.conversation, contact: schema.contact })
    .from(schema.conversation)
    .innerJoin(
      schema.contact,
      eq(schema.conversation.contactId, schema.contact.id)
    )
    .where(
      scoped(
        schema.conversation.organizationId,
        input.organizationId,
        eq(schema.conversation.id, input.conversationId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new TemplateError("not_found", "Conversa não encontrada");
  if (row.conversation.isTest) {
    // Asserção rígida do sandbox (FR-031)
    throw new SendError(
      "sandbox_violation",
      "Conversa de teste do Laboratório: o envio real é proibido"
    );
  }

  const creds = await getCredentialsByOrg(input.organizationId);
  if (!creds) throw new TemplateError("not_connected", "Sem número conectado");
  if (creds.status === "reconnect_required") {
    throw new TemplateError("reconnect_required", "Reconecte o número");
  }

  const waMessageId = await callGraphSend(creds, {
    messaging_product: "whatsapp",
    to: normalizeRecipient(row.contact.phone),
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      ...(variableCount > 0
        ? {
            components: [
              {
                type: "body",
                parameters: Array.from({ length: variableCount }, (_, i) => ({
                  type: "text",
                  text: (variables[i] ?? "").trim(),
                })),
              },
            ],
          }
        : {}),
    },
  });

  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      waMessageId,
      direction: "out",
      type: "template",
      text: renderBody(
        template.body,
        variables.map((v) => v.trim())
      ),
      status: "pending",
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
