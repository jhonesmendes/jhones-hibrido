import { eq } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { resolveInternalCaller } from "@/server/integrations/internal-auth";
import { readMessageMediaBytes } from "@/server/media/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Bytes da mídia de uma mensagem para a automação — é a URL que vai em
 * `message.media.url` no evento enviado ao n8n. */
export async function GET(req: Request, ctx: Params) {
  const caller = await resolveInternalCaller(req);
  if (caller instanceof Response) return caller;

  const { id } = await ctx.params;
  const rows = await getDb()
    .select()
    .from(schema.messageMedia)
    .where(
      scoped(
        schema.messageMedia.organizationId,
        caller.organizationId,
        eq(schema.messageMedia.messageId, id)
      )
    )
    .limit(1);
  const media = rows[0];
  if (!media) return apiError(404, "media_unavailable", "Mídia indisponível");
  if (media.purgedAt) {
    return apiError(410, "media_expired", "Mídia apagada pela política de retenção");
  }
  const bytes = await readMessageMediaBytes(media);
  if (!bytes) return apiError(404, "media_unavailable", "Mídia indisponível");

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": media.mimeType,
      "Content-Length": String(bytes.length),
      ...(media.filename
        ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(media.filename)}` }
        : {}),
    },
  });
}
