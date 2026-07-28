/**
 * As 6 personas ROTEIRIZADAS do Laboratório (FR-030). O cliente simulado não
 * usa LLM: são sequências fixas — determinismo total do lado do cliente.
 * O agente que responde é o REAL (mesmo pipeline da US3).
 */

export type Persona = {
  key: string;
  label: string;
  description: string;
  /** Telefone sintético estável (jamais um número real). */
  phone: string;
  contactName: string;
  script: string[];
};

export const PERSONAS: Persona[] = [
  {
    key: "comprador_decidido",
    label: "Comprador decidido",
    description: "Sabe o que quer e vai direto comprar.",
    phone: "5510000000001",
    contactName: "[Teste] Comprador decidido",
    script: [
      "Oi, boa tarde",
      "Vocês têm furadeira sem fio disponível?",
      "Perfeito, quanto custa a mais vendida?",
      "Fechou, vou levar. Como pago?",
    ],
  },
  {
    key: "pregunton_precios",
    label: "Perguntador de preços",
    description: "Pergunta preço atrás de preço sem se decidir.",
    phone: "5510000000002",
    contactName: "[Teste] Perguntador de preços",
    script: [
      "Oi, qual o preço do martelo?",
      "E a chave Phillips?",
      "Quanto custa a caixa de pregos de 2 polegadas?",
      "Tem desconto se eu levar várias coisas?",
      "Ok, vou pensar",
    ],
  },
  {
    key: "cliente_enojado",
    label: "Cliente irritado",
    description: "Chega bravo por um problema com a compra.",
    phone: "5510000000003",
    contactName: "[Teste] Cliente irritado",
    script: [
      "Olha, isso é um absurdo",
      "Comprei uma lixadeira semana passada e já não liga mais, uma porcaria",
      "Vão me responder ou não? Quero uma solução JÁ",
      "Espero que sim porque não vou perder meu dinheiro",
    ],
  },
  {
    key: "fuera_de_kb",
    label: "Pergunta fora do conhecimento",
    description: "Pergunta algo que o knowledge base não cobre (fuera_de_kb).",
    phone: "5510000000004",
    contactName: "[Teste] Fora do conhecimento",
    script: [
      "Oi, uma pergunta",
      "Qual é a política de garantia e devolução de vocês?",
      "E se o produto der defeito depois de dois meses, vocês trocam?",
      "Onde eu aciono a garantia?",
    ],
  },
  {
    key: "pide_humano",
    label: "Pede um humano",
    description: "Quer ser atendido por uma pessoa (deve escalar).",
    phone: "5510000000005",
    contactName: "[Teste] Pede humano",
    script: [
      "Oi",
      "Tenho um assunto delicado com um pedido",
      "Prefiro ser atendido por uma pessoa, quero falar com um humano",
      "Obrigado",
    ],
  },
  {
    key: "errores_modismos",
    label: "Erros e gírias",
    description: "Escreve com erros de ortografia e gírias brasileiras.",
    phone: "5510000000006",
    contactName: "[Teste] Erros e gírias",
    script: [
      "eae, vcs vende tinta?",
      "aa e vc sabe se tem tiner",
      "qnto o galao d tinta branca pra interior",
      "blz, passo ai na loja mais tarde, vlw",
    ],
  },
];

export const PERSONA_LABELS: Record<string, string> = Object.fromEntries(
  PERSONAS.map((p) => [p.key, p.label])
);
