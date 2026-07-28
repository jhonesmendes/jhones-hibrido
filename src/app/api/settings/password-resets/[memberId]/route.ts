import { apiError, withAuth } from "@/lib/api";
import { generateManualResetLink, PasswordResetError } from "@/server/auth/password-reset";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ memberId: string }> };

/** Gera (e invalida qualquer pendência anterior) um link manual para o owner enviar. */
export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Só o proprietário gera links manuais");
  }
  const { memberId } = await ctx.params;
  try {
    const url = await generateManualResetLink(session.organizationId, memberId);
    return Response.json({ url });
  } catch (err) {
    if (err instanceof PasswordResetError) {
      return apiError(422, err.code, err.message);
    }
    throw err;
  }
});
