import { scheduleAgentTurn } from "@/server/ai/pipeline";
import { isAiConfigured } from "@/lib/env";

/**
 * Ponto de gancho do turno do agente após a ingestão de uma mensagem
 * recebida REAL (as conversas do Laboratório invocam o pipeline
 * diretamente, sem debounce).
 */
export async function maybeRunAgentTurn(
  conversationId: string
): Promise<void> {
  if (!isAiConfigured()) return;
  scheduleAgentTurn(conversationId);
}
