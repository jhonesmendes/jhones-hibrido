import { z } from "zod";
import { requireSession, UnauthorizedError, type SessionContext } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/auth/require-permission";

/** Resposta de erro padrão da API interna (contrato api.md). */
export function apiError(
  status: number,
  code: string,
  message: string
): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * Envolve um route handler autenticado: resolve a sessão (401 se não houver),
 * captura erros não controlados (500 sem stack) e deixa passar Response.
 */
export function withAuth<Args extends unknown[]>(
  handler: (session: SessionContext, ...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    let session: SessionContext;
    try {
      session = await requireSession();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return apiError(401, "unauthorized", err.message);
      }
      throw err;
    }
    try {
      return await handler(session, ...args);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return apiError(403, "forbidden", err.message);
      }
      console.error("[api] erro não controlado:", err);
      return apiError(500, "internal", "Erro interno");
    }
  };
}

/** Faz parse do body JSON com um schema Zod; inválido → Response 422. */
export async function parseBody<T>(
  req: Request,
  schema: z.ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: apiError(422, "invalid_body", "O body deve ser JSON válido"),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    return {
      ok: false,
      response: apiError(422, "invalid_body", detail),
    };
  }
  return { ok: true, data: parsed.data };
}
