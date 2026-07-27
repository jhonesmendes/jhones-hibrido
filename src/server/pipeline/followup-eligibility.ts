/**
 * Lógica pura de elegibilidad del follow-up — separada del acceso a datos
 * para poder testearla sin BD. La resolución de "el cliente respondió" ya
 * se resuelve ANTES de llamar a estas funciones (ver followup-scheduler.ts):
 * acá `lastSend` siempre representa el estado vigente, nunca uno ya resuelto.
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

/** true si el lead lleva más del intervalo sin actividad y no tiene un
 * recordatorio ya activo esperando resolución. */
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

/** true si el recordatorio activo superó el plazo de gracia sin resolverse. */
export function isEligibleForExpiry(
  lastSend: EligibilitySend,
  graceMs: number,
  now: Date
): boolean {
  if (!lastSend || lastSend.status !== "sent") return false;
  const sinceSendMs = now.getTime() - lastSend.sentAt.getTime();
  return sinceSendMs >= graceMs;
}

/** true si el cliente respondió después de que se le envió el recordatorio
 * activo — ese recordatorio deja de contar (se resuelve sin expirar). */
export function respondedAfterSend(
  lead: EligibilityLead,
  lastSend: EligibilitySend
): boolean {
  if (!lastSend || lastSend.status !== "sent") return false;
  if (!lead.lastActivityAt) return false;
  return lead.lastActivityAt.getTime() > lastSend.sentAt.getTime();
}
