import { apiError } from "@/lib/api";
import { checkInviteToken } from "@/server/auth/invite-tokens";

export const dynamic = "force-dynamic";

const CHECK_MESSAGE: Record<"invalid" | "expired" | "used", string> = {
  invalid: "Convite inválido",
  expired: "Convite expirado",
  used: "Convite já utilizado",
};

/** Checagem pública (sem sessão) do token de convite — usada pelo /register. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return apiError(422, "missing_token", "Token ausente");

  const result = await checkInviteToken(token);
  if (!result.ok) {
    return apiError(422, result.code, CHECK_MESSAGE[result.code]);
  }
  return Response.json({ email: result.email, role: result.role });
}
