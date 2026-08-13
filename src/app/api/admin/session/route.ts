import { cookies } from "next/headers";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import {
  ADMIN_SESSION_COOKIE,
  checkOperatorCredentials,
  createSessionCookieValue,
} from "@/server/admin/session";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await parseBody(req, loginSchema);
  if (!body.ok) return body.response;

  if (!checkOperatorCredentials(body.data.email, body.data.password)) {
    return apiError(401, "invalid_credentials", "E-mail ou senha incorretos");
  }

  const value = createSessionCookieValue(body.data.email);
  const jar = await cookies();
  jar.set(ADMIN_SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });

  return Response.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(ADMIN_SESSION_COOKIE);
  return Response.json({ ok: true });
}
