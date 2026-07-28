import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { LOCAL_MEDIA_MARKER } from "@/server/inbox/ingest";

/**
 * Proxy autenticado de mídia: `mediaUrl` externa (canal oficial, CDN da
 * Meta) é buscada sob demanda; o canal não oficial baixa e guarda os bytes
 * localmente na ingestão (ver `message_media`, autohospedado — sem S3/R2),
 * então aqui só serve o que já está no Postgres.
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

  if (!message.mediaUrl) {
    return apiError(404, "media_unavailable", "Mídia indisponível");
  }

  if (message.mediaUrl === LOCAL_MEDIA_MARKER) {
    const mediaRows = await db
      .select()
      .from(schema.messageMedia)
      .where(eq(schema.messageMedia.messageId, id))
      .limit(1);
    const media = mediaRows[0];
    if (!media) return apiError(404, "media_unavailable", "Mídia indisponível");

    return new Response(Buffer.from(media.dataBase64, "base64"), {
      headers: {
        "Content-Type": media.mimeType,
        "Cache-Control": CACHE,
      },
    });
  }

  const res = await fetch(message.mediaUrl, {
    signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  if (res?.ok && res.body) {
    return new Response(res.body, {
      headers: {
        "Content-Type":
          res.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": CACHE,
      },
    });
  }

  return apiError(404, "media_unavailable", "Mídia indisponível");
});
