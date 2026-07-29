import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { AuditClient } from "@/components/settings/audit-client";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await getSessionOrNull();
  if (!session || (session.role !== "owner" && session.role !== "admin")) {
    redirect("/inbox");
  }
  return <AuditClient />;
}
