import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { SmtpClient } from "@/components/settings/smtp-client";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  const session = await getSessionOrNull();
  if (session?.role === "agent") redirect("/settings/departments");
  return <SmtpClient />;
}
