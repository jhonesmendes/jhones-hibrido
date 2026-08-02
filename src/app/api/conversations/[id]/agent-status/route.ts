import { apiError, withAuth } from "@/lib/api";
import { getConversation } from "@/server/inbox/queries";
import { resolveAgentProfile } from "@/server/ai/agent-profile";
import { resolveAiConfig } from "@/server/ai/config";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Estado do agente PARA ESTA CONVERSA (v0.1: o perfil resolvido pode variar
 * por conversa — override > atendente > departamento > padrão da org — não
 * é mais "o" agente único da organização). Usado pelo painel de contato
 * para saber se o toggle "Respondendo" reflete a realidade.
 */
export const GET = withAuth(async (session, _req: Request, { params }: Params) => {
  const { id } = await params;
  const row = await getConversation(session.organizationId, id);
  if (!row) return apiError(404, "not_found", "Conversa não encontrada");

  const [profile, aiConfig] = await Promise.all([
    resolveAgentProfile(session.organizationId, row.conversation),
    resolveAiConfig(session.organizationId),
  ]);

  return Response.json({
    enabled: Boolean(profile?.enabled),
    profileName: profile?.name ?? null,
    aiConfigured: aiConfig !== null,
  });
});
