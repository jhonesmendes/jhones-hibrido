import { apiError, withAuth } from "@/lib/api";
import { revokeApiKey } from "@/server/integrations/api-keys";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const DELETE = withAuth(async (session, _req: Request, { params }: Params) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin revogam chaves de integração");
  }
  const { id } = await params;
  await revokeApiKey(session.organizationId, id);
  return Response.json({ ok: true });
});
