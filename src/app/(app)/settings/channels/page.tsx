import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { ChannelsUnifiedClient } from "@/components/settings/channels-unified-client";

export const dynamic = "force-dynamic";

export default async function ChannelsSettingsPage() {
  const session = await getSessionOrNull();
  // Nunca redireciona pra /settings puro: essa rota cai em
  // /settings/whatsapp -> /settings/channels, um loop pro agente.
  if (session?.role === "agent") redirect("/settings/departments");
  return <ChannelsUnifiedClient />;
}
