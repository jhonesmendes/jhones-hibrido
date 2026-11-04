import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { LOCAL_MEDIA_MARKER } from "@/server/inbox/ingest";
import { recoverPendingMedia } from "@/server/inbox/media-recovery";
import { readMessageMediaBytes } from "@/server/media/store";

/**
 * Proxy autenticado de mídia: `mediaUrl` externa (canal oficial, CDN da
 * Meta) é buscada sob demanda; o canal não oficial baixa e guarda os bytes
 * localmente na ingestão (ver `message_media` + `src/server/media/store.ts`,
 * autohospedado — sem S3/R2), então aqui só serve o que já está guardado.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const CACHE = "private, max-age=3600";
const ON_DEMAND_WAIT_MS = 15_000;

/**
 * `<audio>`/`<video>` pedem a mídia em fatias (`Range: bytes=…`) — sem
 * responder 206, Safari/iOS se recusa a tocar e nos demais o seek não
 * funciona.
 */
function serveBytes(req: Request, bytes: Buffer, mimeType: string): Response {
  const total = bytes.length;
  const baseHeaders = {
    "Content-Type": mimeType,
    "Cache-Control": CACHE,
    "Accept-Ranges": "bytes",
  };
  const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (!match || (!match[1] && !match[2])) {
    return new Response(new Uint8Array(bytes), {
      headers: { ...baseHeaders, "Content-Length": String(total) },
    });
  }

  // `bytes=-N` = últimos N bytes; `bytes=N-` = do N até o fim.
  const start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
  if (start >= total || start > end) {
    return new Response(null, {
      status: 416,
      headers: { ...baseHeaders, "Content-Range": `bytes */${total}` },
    });
  }

  return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${total}`,
    },
  });
}

export const GET = withAuth(async (session, req: Request, ctx: Params) => {
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
    const loadMedia = async () =>
      (
        await db
          .select()
          .from(schema.messageMedia)
          .where(eq(schema.messageMedia.messageId, id))
          .limit(1)
      )[0];
    let media = await loadMedia();
    if (!media) {
      // Download falhou na ingestão: tenta recuperar agora. Se demorar, a
      // recuperação segue em segundo plano e a mídia chega via SSE
      // (`message.updated`) — o navegador não fica pendurado esperando.
      const recovered = await Promise.race([
        recoverPendingMedia(id),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), ON_DEMAND_WAIT_MS)),
      ]);
      if (recovered) media = await loadMedia();
    }
    if (!media) return apiError(404, "media_unavailable", "Mídia indisponível");
    if (media.purgedAt) {
      return apiError(410, "media_expired", "Mídia apagada pela política de retenção");
    }
    const bytes = await readMessageMediaBytes(media);
    if (!bytes) return apiError(404, "media_unavailable", "Mídia indisponível");

    return serveBytes(req, bytes, media.mimeType);
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
