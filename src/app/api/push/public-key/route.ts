import { withAuth } from "@/lib/api";
import { getVapidConfig } from "@/server/push/vapid";

export const dynamic = "force-dynamic";

/** Chave pública VAPID — não é segredo, o navegador precisa dela para inscrever o push. */
export const GET = withAuth(async () => {
  const vapid = getVapidConfig();
  return Response.json({ publicKey: vapid?.publicKey ?? null });
});
