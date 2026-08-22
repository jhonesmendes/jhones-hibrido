import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { getCredentialsByOrg } from "@/server/whatsapp/credentials";
import { normalizeRecipient } from "@/lib/meta/client";
import { callGraphSend, SendError } from "@/server/inbox/send";
import { verifyApiKey } from "@/server/integrations/api-keys";

export const dynamic = "force-dynamic";

/**
 * API interna pra automações externas (N8N, ERP, qualquer integração por
 * token) enviarem texto livre pelo número oficial já conectado nesta
 * instância — autenticada por chave (`x-internal-key`), nunca por sessão de
 * usuário. Duas formas de chave são aceitas:
 *
 * 1) Chave nomeada e revogável, gerada em Configurações → Integrações (uma
 *    por sistema externo, ex. "Sankhya" — ver `src/server/integrations/
 *    api-keys.ts`). Preferida: cada integração tem a própria chave,
 *    revogável sem afetar as outras.
 * 2) `INTERNAL_API_KEY` (env var) — mecanismo legado, mantido só pra não
 *    quebrar quem já configurou assim antes das chaves nomeadas existirem.
 *
 * Deliberadamente simples (passthrough): não cria/atualiza conversa nem
 * mensagem no CRM (a mensagem não aparece na Caixa de entrada) e não checa a
 * janela de 24h da Meta — quem chama essa rota é responsável por só usá-la
 * dentro de uma janela de conversa válida ou com conteúdo permitido fora
 * dela, senão a Meta recusa o envio do lado dela.
 */
async function resolveCaller(req: Request): Promise<{ organizationId: string } | Response> {
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

/** A org desta instância — sempre a mais antiga (só existe 1 de verdade). */
async function getInstanceOrganizationId(): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .orderBy(schema.organization.createdAt)
    .limit(1);
  return rows[0]?.id ?? null;
}

const SEND_ERROR_STATUS: Record<SendError["code"], number> = {
  sandbox_violation: 403,
  not_connected: 409,
  recipient_not_found: 404,
  reconnect_required: 409,
  window_closed: 422,
  meta_error: 422,
  meta_unavailable: 503,
};

const bodySchema = z.object({
  to: z.string().trim().min(8).max(20),
  text: z.string().trim().min(1).max(4096),
});

export async function POST(req: Request) {
  const caller = await resolveCaller(req);
  if (caller instanceof Response) return caller;

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return apiError(422, "invalid_body", "Corpo inválido — espera { to, text }");
  }

  const creds = await getCredentialsByOrg(caller.organizationId);
  if (!creds) {
    return apiError(409, "not_connected", "Nenhum número oficial conectado nesta instância");
  }
  if (creds.status === "reconnect_required") {
    return apiError(409, "reconnect_required", "O número oficial precisa ser reconectado");
  }

  try {
    const messageId = await callGraphSend(creds, {
      messaging_product: "whatsapp",
      to: normalizeRecipient(body.data.to),
      type: "text",
      text: { body: body.data.text },
    });
    return Response.json({ success: true, messageId });
  } catch (err) {
    if (err instanceof SendError) {
      return apiError(SEND_ERROR_STATUS[err.code], err.code, err.message);
    }
    throw err;
  }
}
