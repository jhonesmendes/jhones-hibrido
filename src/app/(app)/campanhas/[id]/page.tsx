import { CampaignDetailClient } from "@/components/campaigns/campaign-detail-client";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CampaignDetailClient id={id} />;
}
