import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getSessionOrNull } from "@/lib/auth/session";
import { isValidHex, resolveAccentSet } from "@/lib/branding";
import { getBranding, saveBranding } from "@/server/branding";

export const dynamic = "force-dynamic";

/** GET público: o login precisa da marca antes de autenticar. */
export async function GET() {
  const session = await getSessionOrNull();
  const branding = await getBranding(session?.organizationId);
  return Response.json({ branding, accentSet: resolveAccentSet(branding.accent) });
}

const putSchema = z.object({
  name: z.string().trim().min(1).max(30),
  accent: z.string().refine(isValidHex, "Cor hex inválida (#rrggbb)"),
});

export const PUT = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Só o proprietário pode alterar a marca");
  }
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  await saveBranding(session.organizationId, body.data);
  return Response.json({ ok: true });
});
