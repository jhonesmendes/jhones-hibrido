/**
 * Janela de atendimento de 24 horas do WhatsApp: só é possível enviar texto
 * livre dentro das 24h seguintes à última mensagem RECEBIDA. Uma
 * conversa sem mensagens recebidas (ex.: iniciada por template) tem a
 * janela fechada.
 */

export const WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWindowOpen(
  lastInboundAt: Date | null,
  now: Date = new Date()
): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < WINDOW_MS;
}

/** Milissegundos restantes de janela (0 se estiver fechada). */
export function windowRemainingMs(
  lastInboundAt: Date | null,
  now: Date = new Date()
): number {
  if (!lastInboundAt) return 0;
  const remaining = WINDOW_MS - (now.getTime() - lastInboundAt.getTime());
  return Math.max(0, remaining);
}
