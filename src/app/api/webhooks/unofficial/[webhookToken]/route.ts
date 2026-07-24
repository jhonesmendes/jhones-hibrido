import { after } from "next/server";
import { getChannelByWebhookToken } from "@/server/unofficial/channel";
import { processUnofficialWebhook } from "@/server/unofficial/ingest";

/**
 * Webhook público del gateway NO oficial (Evolution/WPPConnect/WAHA).
 * Autenticación: el segmento [webhookToken] es un secreto aleatorio por
 * canal — si no coincide, 404 sin efectos (mismo patrón que el de Meta).
 * Responde 200 rápido; el procesamiento va en after().
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ webhookToken: string }> };

export async function POST(req: Request, { params }: Params) {
  const { webhookToken } = await params;
  const channel = await getChannelByWebhookToken(webhookToken);
  if (!channel) return new Response(null, { status: 404 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    // body ilegible: 200 igualmente para que el gateway no reintente en loop
    return Response.json({ received: true });
  }

  after(async () => {
    try {
      await processUnofficialWebhook(channel, payload);
    } catch (err) {
      console.error("[webhook:unofficial] error procesando payload:", err);
    }
  });

  return Response.json({ received: true });
}
