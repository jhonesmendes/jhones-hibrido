/**
 * Lógica pura de elegibilidade do follow-up — separada do acesso a dados
 * para poder testá-la sem BD. A resolução de "o cliente respondeu" já é
 * feita ANTES de chamar essas funções (ver followup-scheduler.ts):
 * aqui `lastSend` sempre representa o estado vigente, nunca um já resolvido.
 */

export type EligibilityLead = {
  lastActivityAt: Date | null;
};

export type EligibilitySend = {
  status: "sent" | "failed" | "cancelled" | "expired";
  sentAt: Date;
} | null;

export function intervalToMs(value: number, unit: "hours" | "days"): number {
  const hourMs = 60 * 60 * 1000;
  return unit === "days" ? value * 24 * hourMs : value * hourMs;
}

/** true se o lead está há mais tempo que o intervalo sem atividade e não tem um
 * lembrete já ativo aguardando resolução. */
export function isEligibleForReminder(
  lead: EligibilityLead,
  lastSend: EligibilitySend,
  intervalMs: number,
  now: Date
): boolean {
  if (!lead.lastActivityAt) return false;
  const inactiveMs = now.getTime() - lead.lastActivityAt.getTime();
  if (inactiveMs < intervalMs) return false;
  if (lastSend && lastSend.status === "sent") return false;
  return true;
}

/** true se o lembrete ativo superou o prazo de carência sem ser resolvido. */
export function isEligibleForExpiry(
  lastSend: EligibilitySend,
  graceMs: number,
  now: Date
): boolean {
  if (!lastSend || lastSend.status !== "sent") return false;
  const sinceSendMs = now.getTime() - lastSend.sentAt.getTime();
  return sinceSendMs >= graceMs;
}

/** true se o cliente respondeu depois que o lembrete ativo foi enviado —
 * esse lembrete deixa de contar (é resolvido sem expirar). */
export function respondedAfterSend(
  lead: EligibilityLead,
  lastSend: EligibilitySend
): boolean {
  if (!lastSend || lastSend.status !== "sent") return false;
  if (!lead.lastActivityAt) return false;
  return lead.lastActivityAt.getTime() > lastSend.sentAt.getTime();
}
