import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { verifyApiKey } from "@/server/integrations/api-keys";
import { CampaignError, campaignErrorStatus, createCampaign } from "@/server/campaigns/create";
import { CampaignSendError, startCampaign } from "@/server/campaigns/send";

export const dynamic = "force-dynamic";

/**
 * API interna pra automações externas (N8N, etc.) dispararem uma campanha
 * pelo canal NÃO OFICIAL (WhatsApp Web) com imagem — mesma autenticação de
 * `/api/internal/send-message` (chave nomeada de Configurações →
 * Integrações, ou INTERNAL_API_KEY legado), mas aqui é disparo em massa
 * pra uma lista de destinatários, não uma mensagem avulsa.
 *
 * Só canal não oficial por ora: oficial exige modelo aprovado na Meta
 * (fluxo totalmente diferente, sem imagem livre por URL) — fora do pedido
 * original. `riskAcknowledged` continua obrigatório mesmo vindo de
 * automação (Constituição IX): quem integra precisa confirmar ciência do
 * risco de ban do WhatsApp Web na própria chamada.
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

async function getInstanceOrganizationId(): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .orderBy(schema.organization.createdAt)
    .limit(1);
  return rows[0]?.id ?? null;
}

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Legenda da imagem (ou texto puro, se `mediaUrl` vier vazio) — aceita
   * {{variavel}} nomeada, preenchida por destinatário via `recipients[].variables`. */
  messageTemplate: z.string().trim().min(1).max(2000),
  /** URL pública de uma imagem — baixada uma vez na criação da campanha. */
  mediaUrl: z.string().url().optional(),
  sendIntervalMs: z.number().int().min(1000).max(300000),
  riskAcknowledged: z.literal(true),
  recipients: z
    .array(
      z.object({
        phone: z.string().trim().min(8).max(20),
        variables: z.record(z.string(), z.string()).optional(),
      })
    )
    .min(1)
    .max(5000),
});

export async function POST(req: Request) {
  const caller = await resolveCaller(req);
  if (caller instanceof Response) return caller;

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return apiError(
      422,
      "invalid_body",
      body.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ")
    );
  }

  try {
    const result = await createCampaign(caller.organizationId, {
      name: body.data.name,
      channel: "unofficial",
      messageTemplate: body.data.messageTemplate,
      mediaUrl: body.data.mediaUrl ?? null,
      sendIntervalMs: body.data.sendIntervalMs,
      riskAcknowledged: body.data.riskAcknowledged,
      source: "list",
      recipients: body.data.recipients,
    });

    let startError: string | null = null;
    try {
      await startCampaign(caller.organizationId, result.campaign.id);
    } catch (err) {
      startError =
        err instanceof CampaignSendError ? err.message : "Não foi possível iniciar o disparo agora";
    }

    return Response.json({ ...result, startError }, { status: 201 });
  } catch (err) {
    if (err instanceof CampaignError) {
      return apiError(campaignErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
}
