import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { CampaignError, campaignErrorStatus, createCampaign } from "@/server/campaigns/create";
import { listCampaigns } from "@/server/campaigns/queries";
import { CampaignSendError, startCampaign } from "@/server/campaigns/send";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const campaigns = await listCampaigns(session.organizationId);
  return Response.json({ campaigns });
});

const csvSourceSchema = z.object({
  source: z.literal("csv"),
  csvText: z.string().min(1),
});

const crmSourceSchema = z.object({
  source: z.literal("crm"),
  stageId: z.string().min(1).nullable().optional(),
  originChannel: z.enum(["official", "unofficial"]).nullable().optional(),
  contactIds: z.array(z.string().min(1)).max(5000).optional(),
});

const officialBase = z.object({
  name: z.string().trim().min(1).max(80),
  channel: z.literal("official"),
  templateId: z.string().min(1),
  scheduledAt: z.string().datetime().nullable().optional(),
});

const unofficialBase = z.object({
  name: z.string().trim().min(1).max(80),
  channel: z.literal("unofficial"),
  messageTemplate: z.string().trim().min(1).max(2000),
  sendIntervalMs: z.number().int().min(1000).max(300000),
  riskAcknowledged: z.literal(true),
  scheduledAt: z.string().datetime().nullable().optional(),
});

const createSchema = z.union([
  officialBase.merge(csvSourceSchema),
  officialBase.merge(crmSourceSchema),
  unofficialBase.merge(csvSourceSchema),
  unofficialBase.merge(crmSourceSchema),
]);

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  try {
    const result = await createCampaign(session.organizationId, body.data);

    // "Agora" (sem agendamento futuro): dispara na sequência. Falha ao
    // iniciar não desfaz a criação — a campanha fica em draft, disparável
    // manualmente na tela de detalhe.
    let startError: string | null = null;
    const scheduledInFuture =
      body.data.scheduledAt &&
      new Date(body.data.scheduledAt).getTime() > Date.now();
    if (!scheduledInFuture) {
      try {
        await startCampaign(session.organizationId, result.campaign.id);
      } catch (err) {
        startError =
          err instanceof CampaignSendError
            ? err.message
            : "Não foi possível iniciar o disparo agora";
      }
    }

    return Response.json({ ...result, startError }, { status: 201 });
  } catch (err) {
    if (err instanceof CampaignError) {
      return apiError(campaignErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
