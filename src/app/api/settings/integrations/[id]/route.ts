import { apiError, withAuth } from "@/lib/api";
import { deleteApiKey, getApiKey, revokeApiKey } from "@/server/integrations/api-keys";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Chave ativa → revoga (some do apiKeys.ts em uso mas fica no histórico).
 * Chave já revogada → exclui de verdade (o operador já reconheceu que ela
 * não presta mais e quer tirá-la da lista). */
export const DELETE = withAuth(async (session, _req: Request, { params }: Params) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin gerenciam chaves de integração");
  }
  const { id } = await params;
  const key = await getApiKey(session.organizationId, id);
  if (!key) return apiError(404, "not_found", "Chave não encontrada");

  if (key.revokedAt) {
    await deleteApiKey(session.organizationId, id);
  } else {
    await revokeApiKey(session.organizationId, id);
  }
  return Response.json({ ok: true });
});
