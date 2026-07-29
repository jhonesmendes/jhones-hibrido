/**
 * Helpers de modelo (template) seguros pra rodar no cliente — sem tocar
 * banco/rede. Espelham a mesma regra de `src/server/whatsapp/templates.ts`
 * (variáveis {{n}} sequenciais a partir de 1); mantidos separados porque o
 * módulo do servidor importa `@/lib/db` e não pode entrar num bundle de
 * componente "use client".
 */

const VARIABLE_REGEX = /\{\{\s*(\d+)\s*\}\}/g;

/** Quantidade de variáveis {{n}} no corpo — maior índice usado. */
export function countTemplateVariables(body: string): number {
  const matches = [...body.matchAll(VARIABLE_REGEX)];
  if (matches.length === 0) return 0;
  return Math.max(...matches.map((m) => Number(m[1])));
}
