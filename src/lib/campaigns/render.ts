/**
 * Renderização de variáveis nomeadas em campanhas do canal não oficial.
 * Genérico — não conhece nomes específicos de variável (Constituição VIII).
 */

const VARIABLE_NAME_REGEX = /\{\{\s*(\w+)\s*\}\}/g;

/** Substitui {{variavel}} pelo valor correspondente; mantém o placeholder se faltar. */
export function renderMessage(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(
    VARIABLE_NAME_REGEX,
    (_, key: string) => variables[key] ?? `{{${key}}}`
  );
}

/** Extrai os nomes únicos de variáveis usadas no template, na ordem de aparição. */
export function extractVariables(template: string): string[] {
  const matches = template.matchAll(VARIABLE_NAME_REGEX);
  return [...new Set([...matches].map((m) => m[1]!))];
}
