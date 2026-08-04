import { publish } from "@/server/events/bus";
import { sendPushToMember } from "@/server/push/send";

/**
 * Avisa o agente designado (Sprint Q2): evento SSE dirigido (só ele recebe,
 * ver `/api/events`) + push best-effort. Uma falha de push nunca derruba o
 * roteamento — só é logada, igual ao padrão já usado em
 * `sendPushToOrganization` (ingest.ts).
 */
export async function notifyAgentAssigned(
  organizationId: string,
  params: {
    targetMemberId: string;
    queueId: string;
    conversationId: string;
    contactId: string;
    departmentId: string;
    contactName: string;
    timeoutAt: Date | null;
  }
): Promise<void> {
  publish(organizationId, {
    type: "queue.assigned",
    data: {
      targetMemberId: params.targetMemberId,
      queueId: params.queueId,
      conversationId: params.conversationId,
      contactId: params.contactId,
      departmentId: params.departmentId,
      contactName: params.contactName,
      timeoutAt: params.timeoutAt ? params.timeoutAt.toISOString() : null,
    },
  });

  await sendPushToMember(params.targetMemberId, {
    title: "Nova conversa na fila",
    body: `${params.contactName} está aguardando atendimento`,
    url: `/inbox?contact=${params.contactId}`,
    conversationId: params.conversationId,
  }).catch((err) => console.error("[queue] falha ao notificar agente designado:", err));
}
