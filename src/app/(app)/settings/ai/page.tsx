import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { AiClient } from "@/components/settings/ai-client";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const session = await getSessionOrNull();
  if (session?.role === "agent") redirect("/settings/departments");
  return <AiClient />;
}
