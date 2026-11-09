import { apiError } from "@/lib/api";
import { checkOwnerInvite, OWNER_INVITE_MESSAGE } from "@/server/auth/owner-invite";

export const dynamic = "force-dynamic";

/** Checagem pública do convite do proprietário — não consome o token. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return apiError(422, "missing_token", "Token ausente");

  const result = await checkOwnerInvite(token);
  if (!result.ok) {
    return apiError(
      result.code === "org_exists" ? 409 : 422,
      result.code,
      OWNER_INVITE_MESSAGE[result.code]
    );
  }
  return Response.json({
    email: result.email,
    organizationName: result.organizationName,
    expiresAt: result.expiresAt.toISOString(),
  });
}
