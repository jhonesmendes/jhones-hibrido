import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { consumePasswordReset, PasswordResetError } from "@/server/auth/password-reset";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  try {
    await consumePasswordReset(body.data.token, body.data.password);
  } catch (err) {
    if (err instanceof PasswordResetError) {
      return apiError(422, err.code, err.message);
    }
    throw err;
  }

  return Response.json({ ok: true });
}
