import { z } from "zod";
import { chatJson, type ResolvedAiConfig } from "@/lib/ai";

const ScriptGeneration = z.object({
  script: z.array(z.string().trim().min(1).max(300)).min(2).max(8),
});

/**
 * Gera o roteiro (falas sequenciais do cliente simulado) a partir de uma
 * descrição livre do cenário — substitui a autoria manual de mensagens uma
 * a uma. Determinístico do lado do cliente DEPOIS de gerado (o roteiro fica
 * salvo e é reusado em toda rodada, sem chamar IA de novo).
 */
export async function generatePersonaScript(input: {
  name: string;
  scenarioDescription: string;
  aiConfig: ResolvedAiConfig;
}): Promise<{ ok: true; script: string[] } | { ok: false; detail: string }> {
  const system = [
    "Você gera roteiros de teste para simular um CLIENTE conversando por WhatsApp com um agente de atendimento.",
    "Gere de 2 a 6 mensagens curtas e sequenciais, em português do Brasil, escritas como um cliente real escreveria (natural, direto, sem formalidade excessiva).",
    "As mensagens devem cobrir o cenário descrito do início ao fim de uma conversa plausível.",
    "NUNCA inclua respostas do agente — só as falas do cliente, uma por item.",
    'Responda SOMENTE um objeto JSON: {"script": ["fala 1", "fala 2", ...]}',
  ].join("\n");
  const user = `Persona: ${input.name}\nCenário: ${input.scenarioDescription}`;

  const result = await chatJson(
    ScriptGeneration,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { config: input.aiConfig }
  );
  if (!result.ok) return { ok: false, detail: result.detail };
  return { ok: true, script: result.data.script };
}
