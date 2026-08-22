/** Rótulos em pt-BR pro rastro técnico (`TraceEventType`, ver
 * `src/server/observability/trace.ts`) — compartilhado entre o painel
 * "Diagnóstico técnico" do inbox (por conversa) e a visão centralizada de
 * Logs no painel admin (organização inteira). */
export const TRACE_LABELS: Record<string, string> = {
  "message.received": "Mensagem recebida",
  "conversation.started_by_agent": "Conversa iniciada pelo agente",
  "conversation.routed_inbox": "Roteada direto pra caixa de entrada",
  "conversation.routed_queue": "Roteada pra fila do departamento",
  "queue.entered": "Entrou na fila",
  "queue.assigned": "Designada a um agente",
  "queue.accepted": "Aceita pelo agente",
  "queue.declined": "Recusada / repassada",
  "queue.selection_timeout": "Cliente não respondeu à seleção",
  "queue.accept_timeout": "Agente não aceitou a tempo",
  "queue.auto_giveup": "Agente desistiu automaticamente",
  "message.sent": "Resposta enviada",
  "message.send_failed": "Falha ao enviar",
  "conversation.transferred": "Conversa transferida",
};
