import { apiError, withAuth } from "@/lib/api";
import { requirePermission } from "@/lib/auth/require-permission";
import { CampaignSendError, campaignSendErrorStatus, startCampaign } from "@/server/campaigns/send";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  await requirePermission(session, "campaigns:send");
  try {
    await startCampaign(session.organizationId, id);
    await logAudit({
      organizationId: session.organizationId,
      memberId: session.memberId,
      action: "campaign.sent",
      resource: "campaign",
      resourceId: id,
      req,
    });
    return Response.json({ started: true });
  } catch (err) {
    if (err instanceof CampaignSendError) {
      return apiError(campaignSendErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
