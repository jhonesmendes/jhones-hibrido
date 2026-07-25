import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getAdapter, UnofficialApiError } from "@/lib/unofficial";
import { getChannelByOrg, toConfig } from "@/server/unofficial/channel";

/**
 * Proxy autenticado de mídia do canal não oficial.
 * O navegador NUNCA fala com o gateway: este endpoint busca a mídia pelo
 * servidor (URL armazenada com header de auth, ou base64 por ID na
 * Evolution/WPPConnect) e a devolve com o content-type correto.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const CACHE = "private, max-age=3600";

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.message)
    .where(
      scoped(
        schema.message.organizationId,
        session.organizationId,
        eq(schema.message.id, id)
      )
    )
    .limit(1);
  const message = rows[0];
  if (!message) return apiError(404, "not_found", "Mensagem não encontrada");

  const channel = await getChannelByOrg(session.organizationId);
  if (!channel) {
    return apiError(404, "not_configured", "Não há canal configurado");
  }
  const adapter = getAdapter(channel.provider);
  const cfg = toConfig(channel);

  try {
    // 1) URL direta armazenada (S3/minio do gateway) — fetch com auth.
    if (message.mediaUrl) {
      const res = await fetch(message.mediaUrl, {
        headers: adapter.mediaAuthHeaders(cfg),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok && res.body) {
        return new Response(res.body, {
          headers: {
            "Content-Type":
              res.headers.get("content-type") ?? "application/octet-stream",
            "Cache-Control": CACHE,
          },
        });
      }
      // URL vencida (presigned): cai para a busca por ID se existir.
    }

    // 2) Busca por ID do provedor (base64).
    const prefix = `unof:${channel.provider}:`;
    if (adapter.fetchMediaById && message.waMessageId?.startsWith(prefix)) {
      const providerMessageId = message.waMessageId.slice(prefix.length);
      const media = await adapter.fetchMediaById(cfg, providerMessageId);
      if (media) {
        return new Response(new Uint8Array(media.data), {
          headers: {
            "Content-Type": media.mimeType,
            "Cache-Control": CACHE,
          },
        });
      }
    }

    return apiError(404, "media_unavailable", "Mídia indisponível no gateway");
  } catch (err) {
    if (err instanceof UnofficialApiError) {
      const status = err.status === 0 || err.status >= 500 ? 503 : 422;
      return apiError(status, "gateway_error", err.message);
    }
    throw err;
  }
});
