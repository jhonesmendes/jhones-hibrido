import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { requestPasswordReset } from "@/server/auth/password-reset";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ email: z.string().trim().email() });

/** 3 solicitações / hora por e-mail — evita abuso de disparo de e-mails. */
const FORGOT_PASSWORD_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 3 };

/** Sempre responde OK — nunca revela se o e-mail existe (FR-016). */
export async function POST(req: Request) {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const rate = checkRateLimit(
    `forgot-password:${body.data.email.toLowerCase()}`,
    FORGOT_PASSWORD_RATE_LIMIT
  );
  if (!rate.allowed) {
    return apiError(429, "rate_limited", "Muitas tentativas; aguarde antes de tentar de novo");
  }

  await requestPasswordReset(body.data.email);
  return Response.json({ ok: true });
}
