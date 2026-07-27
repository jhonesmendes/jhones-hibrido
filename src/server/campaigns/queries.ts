import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

type CampaignRow = typeof schema.campaign.$inferSelect;
type RecipientRow = typeof schema.campaignRecipient.$inferSelect;

export function serializeCampaign(c: CampaignRow) {
  return {
    id: c.id,
    name: c.name,
    channel: c.channel,
    templateId: c.templateId,
    messageTemplate: c.messageTemplate,
    sendIntervalMs: c.sendIntervalMs,
    status: c.status,
    total: c.total,
    sent: c.sent,
    failed: c.failed,
    startedAt: c.startedAt?.toISOString() ?? null,
    completedAt: c.completedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

export function serializeRecipient(r: RecipientRow) {
  return {
    id: r.id,
    phone: r.phone,
    variables: (r.variables as Record<string, string> | null) ?? {},
    status: r.status,
    error: r.error,
  };
}

export async function listCampaigns(organizationId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.campaign)
    .where(scoped(schema.campaign.organizationId, organizationId))
    .orderBy(desc(schema.campaign.createdAt));
  return rows.map(serializeCampaign);
}

export async function getCampaign(organizationId: string, campaignId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.campaign)
    .where(
      scoped(
        schema.campaign.organizationId,
        organizationId,
        eq(schema.campaign.id, campaignId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getCampaignWithRecipients(
  organizationId: string,
  campaignId: string
) {
  const db = getDb();
  const campaign = await getCampaign(organizationId, campaignId);
  if (!campaign) return null;
  const recipients = await db
    .select()
    .from(schema.campaignRecipient)
    .where(eq(schema.campaignRecipient.campaignId, campaignId))
    .orderBy(schema.campaignRecipient.createdAt);
  return {
    campaign: serializeCampaign(campaign),
    recipients: recipients.map(serializeRecipient),
  };
}
