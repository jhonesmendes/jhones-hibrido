import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Foto de perfil cacheada (só existe pra contatos do WhatsApp Web — ver
 * `refreshContactAvatar`). Usada como ícone das notificações de mensagem
 * nova, no mesmo espírito do proxy de mídia em `/api/media/[id]`.
 */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const db = getDb();

  const rows = await db
    .select({
      avatarBase64: schema.contact.avatarBase64,
      avatarMimeType: schema.contact.avatarMimeType,
    })
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        session.organizationId,
        eq(schema.contact.id, id)
      )
    )
    .limit(1);
  const contact = rows[0];
  if (!contact?.avatarBase64) {
    return apiError(404, "avatar_unavailable", "Foto de perfil indisponível");
  }

  return new Response(Buffer.from(contact.avatarBase64, "base64"), {
    headers: {
      "Content-Type": contact.avatarMimeType ?? "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
});
