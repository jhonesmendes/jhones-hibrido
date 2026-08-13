import { cookies } from "next/headers";
import { apiError } from "@/lib/api";
import { ADMIN_SESSION_COOKIE, verifySessionCookieValue } from "@/server/admin/session";

/** Usado nas rotas `/api/admin/*` — devolve a Response de 401 pronta quando
 * não há sessão de operador válida, ou `null` quando pode prosseguir. */
export async function requireOperatorSession(): Promise<Response | null> {
  const jar = await cookies();
  const session = verifySessionCookieValue(jar.get(ADMIN_SESSION_COOKIE)?.value);
  if (!session) {
    return apiError(401, "unauthorized", "Sessão de operador inválida ou expirada");
  }
  return null;
}
