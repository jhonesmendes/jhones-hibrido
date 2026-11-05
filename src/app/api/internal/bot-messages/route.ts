import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { logAudit } from "@/server/auth/audit";
import {
  BotMessagesError,
  listBotMessages,
  MAX_BOT_MESSAGE_LENGTH,
  saveBotMessages,
} from "@/server/bot-messages/store";
import { getInstanceOrganizationId } from "@/server/integrations/internal-auth";

export const dynamic = "force-dynamic";

/** Consumida só pelo painel central do operador, como `/api/internal/api-keys`. */
function requireControlSecret(req: Request): Response | null {
  const env = getEnv();
  if (!env.LICENSE_CONTROL_SECRET) {
    return apiError(503, "license_control_not_configured", "API interna não configurada nesta instância");
  }
  if (req.headers.get("x-license-control-secret") !== env.LICENSE_CONTROL_SECRET) {
    return apiError(401, "unauthorized", "Segredo inválido");
  }
  return null;
}

export async function GET(req: Request) {
  const denied = requireControlSecret(req);
  if (denied) return denied;
  const messages = await listBotMessages();
  return Response.json({ available: messages !== null, messages: messages ?? [] });
}

const putSchema = z.object({
  messages: z.record(
    z.string().regex(/^msg_[a-z0-9_]+$/),
    z.string().trim().min(1, "A mensagem não pode ficar vazia").max(MAX_BOT_MESSAGE_LENGTH)
  ),
});

export async function PUT(req: Request) {
  const denied = requireControlSecret(req);
  if (denied) return denied;
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  try {
    const changed = await saveBotMessages(body.data.messages);
    const organizationId = await getInstanceOrganizationId();
    if (changed.length > 0 && organizationId) {
      await logAudit({
        organizationId,
        action: "bot.messages_changed",
        resource: "bot_fluxo_config",
        req,
        metadata: { keys: changed, source: "admin_panel" },
      });
    }
    return Response.json({ changed, messages: (await listBotMessages()) ?? [] });
  } catch (err) {
    if (err instanceof BotMessagesError) {
      return apiError(err.code === "not_available" ? 404 : 422, err.code, err.message);
    }
    throw err;
  }
}
