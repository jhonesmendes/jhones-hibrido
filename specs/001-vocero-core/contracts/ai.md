# Contrato: Ações do agente e juiz do Laboratório

## Adaptador LLM (fronteira única)

`lib/ai`: cliente `fetch` compatível com OpenRouter. Env: `OPENROUTER_API_TOKEN` (opcional —
sem ele, agente/Laboratório desabilitados com estado vazio), `OPENROUTER_BASE_URL`
(default `https://openrouter.ai/api`), `OPENROUTER_MODEL`, `OPENROUTER_JUDGE_MODEL`
(default = `OPENROUTER_MODEL`). API: `chatJson<T>(schema, messages, opts)` → faz parse com
extração robusta (bloco ```json, primeiro `{...}` balanceado), valida com Zod,
tenta novamente diante de falha de rede/parse/validação (2 retentativas, backoff curto). Um
soluço do provedor NUNCA propaga exceção ao turno: esgota as retentativas → resultado
`error` tipado.

## Ação do agente (uma por turno)

```ts
const AgentAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('none') }),
  z.object({ action: z.literal('reply'), text: z.string().min(1) }),
  z.object({ action: z.literal('update_lead'), note: z.string().min(1),
             reply: z.string().optional() }),
  z.object({ action: z.literal('move_stage'), stage: z.string().min(1),
             reply: z.string().optional() }),
  z.object({ action: z.literal('handoff'), reason: z.string().optional(),
             farewell: z.string().optional() }),
])
```

- `move_stage.stage` é resolvido contra os nomes das etapas da org (fuzzy exato →
  lower-case); sem match → degrada para `reply` se trouxer texto, ou `none`.
- Regex de respaldo do handoff (avaliado sobre a mensagem do cliente ANTES do LLM):
  `/(hablar|comunicar|contactar)[\s\S]{0,40}?(asesor|humano|persona|alguien)|un asesor|atenci[oó]n humana/i`
  — "somos 4 pessoas" NÃO combina (unit test).
- Disparadores de turno: ingestão de mensagem recebida em conversa com IA ativa
  (global + conversa + sem handoff). Debounce (coalesce) 6s produção / 0 no
  Laboratório; lock in-process por `conversation_id`; as mensagens que chegam durante o
  turno são reenfileiradas.
- Janela fechada ou erro persistente do provedor → handoff automático
  (`handoff_reason: 'ventana' | 'error'`), sem enviar texto livre.

## Juiz do Laboratório (uma chamada por conversa)

Input: transcript completo + KB + comportamento. Output (Zod):

```ts
const Verdict = z.object({
  veredicto: z.enum(['verde', 'amarillo', 'rojo']),
  hallazgos: z.array(z.object({
    tipo: z.enum(['alucinacion', 'fuera_de_kb', 'debio_escalar', 'tono']),
    evidencia: z.string(),
    sugerencia: z.object({ pregunta: z.string(), respuesta: z.string() }).optional(),
  })),
})
```

Juiz inválido após retentativas → caso `judge_failed` (excluído do score, visível no
relatório); a execução continua.

## Personas roteirizadas (fixas, sem LLM)

6 chaves: `comprador_decidido`, `pregunton_precios`, `cliente_enojado`, `fuera_de_kb`,
`pide_humano`, `errores_modismos`. Cada uma: 4–5 mensagens predefinidas; o runner envia
mensagem → aguarda o turno do agente (pipeline real, debounce 0) → próxima. Fim do
roteiro ou primeiro handoff → juiz.
