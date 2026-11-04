import { getSessionOrNull } from "@/lib/auth/session";
import { StorageClient } from "@/components/settings/storage-client";

export const dynamic = "force-dynamic";

export default async function StorageSettingsPage() {
  const session = await getSessionOrNull();
  return <StorageClient canEdit={session?.role === "owner"} />;
}
