import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { TemplatesClient } from "@/components/settings/templates-client";

export const dynamic = "force-dynamic";

export default async function TemplatesSettingsPage() {
  const session = await getSessionOrNull();
  if (session?.role === "agent") redirect("/settings/departments");
  return <TemplatesClient />;
}
