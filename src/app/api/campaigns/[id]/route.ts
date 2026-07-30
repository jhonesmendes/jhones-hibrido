import { apiError, withAuth } from "@/lib/api";
import { getCampaignWithRecipients } from "@/server/campaigns/queries";
import {
  CampaignSendError,
  campaignSendErrorStatus,
  deleteCampaign,
} from "@/server/campaigns/send";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const result = await getCampaignWithRecipients(session.organizationId, id);
  if (!result) return apiError(404, "not_found", "Campanha não encontrada");
  return Response.json(result);
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    await deleteCampaign(session.organizationId, id);
    return Response.json({ deleted: true });
  } catch (err) {
    if (err instanceof CampaignSendError) {
      return apiError(campaignSendErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
