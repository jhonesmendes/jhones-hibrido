import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { createApiKey, listApiKeys } from "@/server/integrations/api-keys";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin veem as chaves de integração");
  }
  const keys = await listApiKeys(session.organizationId);
  return Response.json({
    keys: keys.map((k) => ({
      ...k,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
      revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
    })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin criam chaves de integração");
  }
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const { id, token } = await createApiKey(session.organizationId, body.data.name);
  return Response.json({ id, token }, { status: 201 });
});
