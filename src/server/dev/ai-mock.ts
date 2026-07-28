import { JUDGE_MARKER } from "@/server/ai/prompts";

/**
 * Provedor LLM determinístico para o self-test (contrato mocks.md).
 * Despacha pelo conteúdo da última mensagem `user` (ou do system se for o
 * juiz). JAMAIS é fallback em runtime: só responde se OPENROUTER_BASE_URL
 * apontar explicitamente para ele e o gate de mocks estiver ativo.
 */

type InMessage = { role: string; content: string };

export function aiMockCompletion(messages: InMessage[]): string {
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const lastUser =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // Juiz do Laboratório: veredito determinístico por persona. Para fechar o
  // loop do self-test, a persona fuera_de_kb passa a verde se o CONHECIMENTO
  // configurado já cobrir garantias/devoluções (sugestão aplicada).
  if (system.includes(JUDGE_MARKER)) {
    const kbSection =
      lastUser
        .split("CONHECIMENTO CONFIGURADO:")[1]
        ?.split("TRANSCRIPT COMPLETO:")[0] ?? "";
    const kbCoversWarranty = /garant|devolu/i.test(kbSection);
    if (lastUser.includes("fuera_de_kb") && !kbCoversWarranty) {
      return JSON.stringify({
        veredicto: "rojo",
        hallazgos: [
          {
            tipo: "fuera_de_kb",
            evidencia:
              "O cliente perguntou sobre garantia e devolução e o conhecimento não cobre.",
            sugerencia: {
              pregunta: "Qual é a política de garantia e devolução?",
              respuesta:
                "Aceitamos devoluções em até 30 dias com o cupom da compra; a garantia depende do fabricante.",
            },
          },
        ],
      });
    }
    return JSON.stringify({ veredicto: "verde", hallazgos: [] });
  }

  const text = lastUser.toLowerCase();

  // Persona pide_humano (o regex de reserva captura a frase canônica; este
  // ramo cobre variantes que chegam ao modelo).
  if (
    text.includes("humano") ||
    text.includes("asesor") ||
    text.includes("atendente")
  ) {
    return JSON.stringify({ action: "handoff", reason: "cliente" });
  }

  // Intenção de compra → mover para Interessado.
  if (
    text.includes("lo compro") ||
    text.includes("quiero comprar") ||
    text.includes("me lo llevo") ||
    text.includes("vou levar") ||
    text.includes("quero comprar")
  ) {
    return JSON.stringify({
      action: "move_stage",
      stage: "Interessado",
      reply: "Excelente! Vou reservar o produto e um colega confirma o pagamento.",
    });
  }

  const eco = lastUser.slice(0, 80);
  return JSON.stringify({
    action: "reply",
    text: `Resposta de teste sobre: ${eco}`,
  });
}
