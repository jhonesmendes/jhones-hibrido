import type { schema } from "@/lib/db";

type AgentProfile = typeof schema.agentProfile.$inferSelect;
type KbEntry = typeof schema.kbEntry.$inferSelect;

/** Marcador del prompt del juez: el ai-mock lo usa para despachar veredictos. */
export const JUDGE_MARKER = "[JUEZ]";

export function renderKb(entries: KbEntry[]): string {
  if (entries.length === 0) return "(knowledge base vazio)";
  return entries
    .map((e) =>
      e.kind === "qa"
        ? `P: ${e.question}\nR: ${e.answer}`
        : (e.content ?? "")
    )
    .filter(Boolean)
    .join("\n\n");
}

/**
 * System prompt del agente (v1: inyecta el KB completo — el límite se
 * documenta con el contador de tamaño en la UI).
 */
export function buildAgentSystemPrompt(input: {
  profile: AgentProfile;
  kb: KbEntry[];
  stages: { name: string }[];
}): string {
  const { profile } = input;
  const stageNames = input.stages.map((s) => s.name).join(" | ");
  return [
    `Você é "${profile.name}", o assistente de WhatsApp deste negócio. Você responde SEMPRE em português do Brasil, com mensagens curtas e naturais para chat.`,
    profile.tone ? `Tom: ${profile.tone}` : null,
    profile.instructions ? `Instruções do negócio:\n${profile.instructions}` : null,
    profile.escalationRules
      ? `Regras de escalonamento para humano:\n${profile.escalationRules}`
      : null,
    profile.greeting ? `Saudação sugerida para conversas novas: ${profile.greeting}` : null,
    `CONHECIMENTO DO NEGÓCIO (sua única fonte de verdade; se algo não está aqui, NÃO invente — diga que vai confirmar com a equipe ou escale):\n${renderKb(input.kb)}`,
    `Etapas do pipeline disponíveis: ${stageNames}`,
    [
      "Em cada turno você responde SOMENTE um objeto JSON com UMA ação:",
      '- {"action":"none"} — não responder nada.',
      '- {"action":"reply","text":"..."} — responder ao cliente.',
      '- {"action":"update_lead","note":"...","reply":"..."} — salvar uma nota do lead (reply opcional).',
      '- {"action":"move_stage","stage":"<nome exato da etapa>","reply":"..."} — mover o lead (reply opcional).',
      '- {"action":"handoff","reason":"...","farewell":"..."} — escalar para um humano (farewell opcional para se despedir).',
      "Regras duras:",
      "- Se o cliente pedir para falar com uma pessoa/humano/atendente → handoff.",
      "- Se a pergunta NÃO está coberta pelo conhecimento → NÃO invente: responda que vai confirmar ou escale.",
      "- Se detectar intenção clara de compra → move_stage para a etapa de interessados e confirme com o cliente.",
      "- JSON puro, sem markdown nem texto adicional.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Prompt del juez del Laboratorio: UNA llamada por conversación (FR-032). */
export function buildJudgePrompt(input: {
  persona: string;
  transcript: { role: "cliente" | "agente"; text: string }[];
  kbText: string;
  behaviorText: string;
}): { system: string; user: string } {
  const system = [
    `${JUDGE_MARKER} Você é um avaliador de qualidade independente de agentes de WhatsApp. Você avalia UMA conversa simulada completa contra o conhecimento e o comportamento configurados. Você é rigoroso: alucinação (inventar dados que não estão no conhecimento) é a falha mais grave.`,
    "Você responde SOMENTE um objeto JSON com este esquema:",
    '{"veredicto":"verde"|"amarillo"|"rojo","hallazgos":[{"tipo":"alucinacion"|"fuera_de_kb"|"debio_escalar"|"tono","evidencia":"citação textual do transcript","sugerencia":{"pregunta":"...","respuesta":"..."}}]}',
    "- verde: sem problemas relevantes. amarillo: melhorável. rojo: falha grave.",
    "- `sugerencia` é opcional: inclua quando uma nova entrada P/R do knowledge base evitaria o problema.",
    "- Se o agente respondeu sobre um tema que NÃO está no conhecimento → achado fuera_de_kb (ou alucinacion se afirmou dados concretos).",
    "- Se o cliente pediu um humano e não houve escalonamento → debio_escalar.",
  ].join("\n");

  const transcript = input.transcript
    .map((t) => `${t.role === "cliente" ? "CLIENTE" : "AGENTE"}: ${t.text}`)
    .join("\n");

  const user = [
    `PERSONA SIMULADA: ${input.persona}`,
    `COMPORTAMENTO CONFIGURADO:\n${input.behaviorText || "(sem configurar)"}`,
    `CONHECIMENTO CONFIGURADO:\n${input.kbText || "(vazio)"}`,
    `TRANSCRIPT COMPLETO:\n${transcript}`,
    "Avalie e responda o JSON.",
  ].join("\n\n");

  return { system, user };
}
