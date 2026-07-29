import { scheduleAgentTurn } from "@/server/ai/pipeline";

/**
 * Ponto de gancho do turno do agente após a ingestão de uma mensagem
 * recebida REAL (as conversas do Laboratório invocam o pipeline
 * diretamente, sem debounce). A checagem de IA configurada (env ou
 * override por organização) acontece dentro de runAgentTurn — aqui só
 * agenda; não dá para pré-filtrar sem já saber a organização.
 */
export async function maybeRunAgentTurn(
  conversationId: string
): Promise<void> {
  scheduleAgentTurn(conversationId);
}
