import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { listWorkflows, N8nApiError } from "@/server/n8n/client";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  baseUrl: z.string().trim().url(),
  apiKey: z.string().trim().min(1),
});

/** Teste de conexão: lista workflows com as credenciais informadas, NÃO salva. */
export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin testam o N8N");
  }
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  try {
    const workflows = await listWorkflows(body.data);
    return Response.json({ ok: true, workflowCount: workflows.length });
  } catch (err) {
    if (err instanceof N8nApiError) {
      return apiError(422, err.code, err.message);
    }
    throw err;
  }
});
