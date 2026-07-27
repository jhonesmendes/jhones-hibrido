import { apiError, withAuth } from "@/lib/api";
import { CampaignSendError, campaignSendErrorStatus, startCampaign } from "@/server/campaigns/send";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    await startCampaign(session.organizationId, id);
    return Response.json({ started: true });
  } catch (err) {
    if (err instanceof CampaignSendError) {
      return apiError(campaignSendErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
