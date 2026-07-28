import { SmtpClient } from "@/components/settings/smtp-client";

export const dynamic = "force-dynamic";

export default function EmailSettingsPage() {
  return <SmtpClient />;
}
