import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { CampaignError, campaignErrorStatus, createCampaign } from "@/server/campaigns/create";
import { listCampaigns } from "@/server/campaigns/queries";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const campaigns = await listCampaigns(session.organizationId);
  return Response.json({ campaigns });
});

const createSchema = z.discriminatedUnion("channel", [
  z.object({
    name: z.string().trim().min(1).max(80),
    channel: z.literal("official"),
    templateId: z.string().min(1),
    csvText: z.string().min(1),
  }),
  z.object({
    name: z.string().trim().min(1).max(80),
    channel: z.literal("unofficial"),
    messageTemplate: z.string().trim().min(1).max(2000),
    sendIntervalMs: z.number().int().min(1000).max(300000),
    riskAcknowledged: z.literal(true),
    csvText: z.string().min(1),
  }),
]);

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  try {
    const result = await createCampaign(session.organizationId, body.data);
    return Response.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof CampaignError) {
      return apiError(campaignErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
