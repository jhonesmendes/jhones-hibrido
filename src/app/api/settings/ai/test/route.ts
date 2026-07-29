import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { testAiConnection } from "@/lib/ai";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  baseUrl: z.string().trim().url(),
  apiKey: z.string().trim().min(1),
  model: z.string().trim().min(1),
});

/** Teste de conexão: chamada mínima real ao provedor, NÃO salva. */
export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin testam a IA");
  }
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const result = await testAiConnection(body.data);
  if (!result.ok) {
    return apiError(422, "connection_failed", result.message);
  }
  return Response.json({ ok: true });
});
