# Contrato: Ambiente de testes interno (wa-mock + ai-mock)

Ambos controlados por `WA_MOCK_ENABLED=true` **e** `NODE_ENV !== 'production'` → se não,
**404 incondicional** (unit test). Não aparecem em `.env.example`.

## wa-mock — harness da Cloud API

Interceptação: `META_GRAPH_BASE_URL` aponta para `http://localhost:3000/api/dev/wa-mock/graph`
(o cliente Graph usa essa base para TODAS as chamadas).

- `POST /api/dev/wa-mock/inbound` — simula uma mensagem recebida: `{ phoneNumberId, from,
  name?, type?, text?, waMessageId?, timestamp? }`. Constrói o payload real da Meta,
  assina com `META_APP_SECRET` (se configurado) e faz POST interno ao webhook
  público (URL com webhookToken). Overrides: `waMessageId` (teste de dedup), `timestamp`
  (teste de janela de 24h).
- `POST /api/dev/wa-mock/status` — simula status: `{ waMessageId, status }` → payload
  `statuses` ao webhook.
- `POST /api/dev/wa-mock/template-status` — simula `message_template_status_update`:
  `{ name, language, event: 'APPROVED'|'REJECTED', reason? }`.
- `ANY /api/dev/wa-mock/graph/*` — imita a Graph API:
  - `POST .../{phoneNumberId}/messages` → `200 { messages: [{ id: "wamid.mock..." }] }`
    e registra no **outbox** em memória. Se o body for template, registra
    os componentes.
  - `GET .../{phoneNumberId}?fields=...` → valida o token de teste: token com sufixo
    mágico `-invalid` → `401 { error: { code: 190, ... } }` (teste do caminho infeliz do
    wizard); se não → `200 { display_phone_number, verified_name, id }`.
  - `POST .../{wabaId}/message_templates` → `200 { id: "tplmock..." , status: "PENDING" }`.
- `GET /api/dev/wa-mock/outbox` — lista de envios capturados (asserções E2E).
- `DELETE /api/dev/wa-mock/outbox` — limpa o estado do harness.

## ai-mock — provedor LLM determinístico

`POST /api/dev/ai-mock/chat/completions` (compatível com OpenAI; no self-test
`OPENROUTER_BASE_URL=http://localhost:3000/api/dev/ai-mock`). Decide pelo conteúdo do
último mensagem `user`:

- Contém o marcador de JUIZ (o prompt do juiz inclui `[JUEZ]`): veredito fixo —
  persona `fuera_de_kb` → `rojo` com 1 achado `fuera_de_kb` + sugestão
  `{pregunta, respuesta}`; resto → `verde` sem achados.
- "quiero hablar con un humano" (ou outra frase da persona `pide_humano`) →
  `{"action":"handoff"}`.
- Intenção de compra ("lo compro", "quiero comprar", persona compradora) →
  `{"action":"move_stage","stage":"Interesado","reply":"..."}`.
- Qualquer outro caso → `{"action":"reply","text":"Resposta de teste sobre: <eco>"}`.

Resposta com shape OpenRouter: `{ choices: [{ message: { content: "<json>" } }] }`.
O ai-mock NUNCA é fallback em runtime: só é usado se `OPENROUTER_BASE_URL` apontar para
ele explicitamente (ambiente de teste/dev).
