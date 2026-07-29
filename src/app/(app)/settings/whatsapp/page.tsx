import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** /settings/whatsapp foi unificado em /settings/channels (aba "Oficial"). */
export default function WhatsappSettingsPage() {
  redirect("/settings/channels");
}
