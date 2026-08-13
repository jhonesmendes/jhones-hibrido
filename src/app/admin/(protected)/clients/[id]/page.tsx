import { ClientDetailClient } from "@/components/admin/client-detail-client";

export const dynamic = "force-dynamic";

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientDetailClient clientId={id} />;
}
