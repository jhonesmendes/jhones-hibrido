import { withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Dados do webhook para colar na Meta ou no backend da agência (FR-043). */
export const GET = withAuth(async () => {
  const env = getEnv();
  const url = `${env.APP_BASE_URL.replace(/\/$/, "")}/api/webhooks/wa/${env.META_WEBHOOK_VERIFY_TOKEN}`;
  return Response.json({
    url,
    verifyToken: env.META_WEBHOOK_VERIFY_TOKEN,
    isHttps: url.startsWith("https://"),
    signatureLayer: Boolean(env.META_APP_SECRET),
  });
});
