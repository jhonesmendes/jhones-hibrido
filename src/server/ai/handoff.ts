/**
 * Padrão de BACKUP de intenção de escalonamento (FR-022). É avaliado sobre a
 * mensagem do cliente ANTES do LLM: se der match, o handoff ocorre mesmo que
 * o modelo não detecte. Projetado para exigir um verbo de contato perto do
 * objeto humano — "somos 4 personas" NÃO dá match (teste unitário).
 */
export const HANDOFF_BACKUP_REGEX =
  /(hablar|comunicar|contactar|falar|conversar)[\s\S]{0,40}?(asesor|humano|persona|alguien|atendente|pessoa|algu[eé]m)|un asesor|um atendente|atenci[oó]n humana|atendimento humano/i;

export function matchesHandoffIntent(text: string): boolean {
  return HANDOFF_BACKUP_REGEX.test(text);
}
