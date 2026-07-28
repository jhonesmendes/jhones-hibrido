# Research — 001-vocero-core

> Decisões de design verificadas (DV-VC-n). Os padrões marcados como "projeto de
> referência privado em produção" vêm de um sistema real em produção cujo código não faz
> parte deste repositório; aqui apenas o padrão é documentado.

## DV-VC-01 — Tempo real: SSE, não WebSocket

**Decisão**: `GET /api/events` com Server-Sent Events; EventSource no cliente.

**Racional**: Next.js App Router self-hosted não expõe um servidor WS sem processo
adicional; SSE é HTTP puro → atravessa Caddy/Traefik/Coolify sem configuração. A
caixa de entrada só precisa de servidor→cliente. EventSource reconecta sozinho.

**Requisitos rígidos** (falham silenciosamente atrás de proxies se omitidos):
`Content-Type: text/event-stream` exato, `Cache-Control: no-cache, no-transform`,
`X-Accel-Buffering: no`, heartbeat `: ping` a cada ~25s, `force-dynamic`. Catch-up por
refetch com `since=` ao reconectar (o servidor não garante replay). Verificar ≤2s
tanto em `pnpm dev` quanto via compose+Caddy.

**Alternativas descartadas**: WebSocket (processo extra ou custom server → quebra o
standalone), polling (latência/carga).

## DV-VC-02 — Webhook: duas camadas de autenticação

**Decisão**: Rota `/api/webhooks/wa/[webhookToken]`.
- **Camada 1 (sempre)**: o segmento deve coincidir (comparação timing-safe) com
  `META_WEBHOOK_VERIFY_TOKEN`; se não → 404 sem efeitos colaterais.
- **Camada 2 (opcional)**: se `META_APP_SECRET` estiver configurado, validar
  `x-hub-signature-256` = HMAC-SHA256 do **body cru** (ler `req.text()` ANTES de
  fazer parse do JSON); inválida → 401. Sem secret → aviso informativo em Settings, não
  erro.

GET = handshake de verificação (`hub.mode=subscribe` + token → devolver
`hub.challenge` em texto puro). POST sempre responde 200 após validar (a Meta tenta de
novo e pode desativar o webhook diante de erros repetidos); o processamento pesado vai
em `after()`.

**Origem**: projeto de referência privado em produção + docs oficiais da Meta.

## DV-VC-03 — Roteamento do payload da Meta

- Mensagens/status chegam por `entry[].changes[].value` com `metadata.phone_number_id`
  → resolver credencial/org por `phone_number_id` (UNIQUE em `meta_credentials`).
- `message_template_status_update` chega em nível de WABA → rotear por `entry[].id`
  (= WABA ID).
- Idempotência: `message.wa_message_id` UNIQUE +
  `.onConflictDoNothing({ target }).returning()` → se não devolver linha, já existia
  (não redisparar o agente nem o SSE).
- Status monotônicos: `pending < sent < delivered < read`; nunca regredir (um
  `delivered` tardio não sobrescreve `read`). `failed` sempre se aplica.

## DV-VC-04 — Modo agência: override de callback por WABA (verificado contra a doc oficial)

**Sintaxe verificada** (Graph API **v25.0**, vigente em fev-2026):

```
POST https://graph.facebook.com/v25.0/{WABA_ID}/subscribed_apps
Authorization: Bearer {token com whatsapp_business_management}
{ "override_callback_uri": "https://cliente.com/api/webhooks/wa/<token>",
  "verify_token": "<META_WEBHOOK_VERIFY_TOKEN do cliente>" }
```

- A Meta faz o handshake GET contra a URI no momento do POST; inalcançável → 422.
- `GET {WABA_ID}/subscribed_apps` mostra o override; POST sem esses campos o
  remove; DELETE desinscreve o app por completo.
- **Limitação confirmada**: os webhooks de templates
  (`message_template_status_update`) **NÃO seguem o override** — vão apenas ao callback
  do app. Compensação: sincronização via Graph API
  (`GET {WABA_ID}/message_templates`) com botão "Sincronizar" + poll ao abrir a
  aba de templates. Documentar honestamente no README (modo agência).
- Após conectar no modo direto, também é executado `POST {WABA_ID}/subscribed_apps`
  (sem override) best-effort — necessário para que o app receba webhooks daquela WABA.

## DV-VC-05 — Criptografia de credenciais: AES-256-GCM

Chave de 32 bytes a partir de `ENCRYPTION_KEY` (base64, 44 chars), IV de 12 bytes
aleatório por operação, armazenar `token_cipher`/`token_iv`/`token_tag` separadamente.
GCM dá integridade (tag) além de confidencialidade. Nunca logar o token; ao cliente
apenas `last4` + estado. **Origem**: projeto de referência privado em produção.

## DV-VC-06 — Adaptador LLM único (`chatJson<T>`)

Um único cliente `fetch` compatível com OpenRouter como fronteira. 3 tentativas com
instrução STRICT na retentativa; extração robusta (fence ```json, fallback primeiro
`{` → último `}`); Zod ao final; jamais logar a key. Falha esgotada → resultado
`error` tipado, nunca exceção no turno (regra operacional: um soluço do provedor não
derruba o turno). `OPENROUTER_JUDGE_MODEL` default = `OPENROUTER_MODEL`. Sem token →
estados vazios (nunca ai-mock como fallback fora de dev).

## DV-VC-07 — Turno do agente: coalesce + lock in-process

Map em memória por `conversation_id` com `{ timer, running, pending }`: debounce
`AGENT_COALESCE_MS` (6000 prod / 0 Laboratório); se chegar mensagem durante o turno →
`pending=true` → reexecutar uma vez ao terminar. Suficiente para monolito de uma
instância (decisão de escopo v1: sem fila externa — Princípio II). Regex de respaldo
de handoff é avaliado ANTES do LLM. Ações validadas server-side contra allowlists
(etapas da org); sem match → degradar para `reply`/`none`. **Origem**: projeto de
referência privado em produção, simplificado.

## DV-VC-08 — Laboratório: execução in-process

POST fire-and-forget dentro do mesmo processo Node (sem fila, sem worker): o handler
cria a execução e dispara a corrida async; progresso via SSE `lab.run` + GET de detalhe.
Turnos sequenciais (persona por persona, mensagem por mensagem, debounce 0). Lock de
concorrência por **BD** (índice parcial UNIQUE `(organization_id) WHERE
status='running'`) — sobrevive a múltiplas réplicas melhor do que um lock em memória e
dá 409 limpo. Timeout 10 min → `failed`; no boot (`instrumentation.ts`) marcar `running`
órfãos → `failed`. Sandbox: conversas `is_test=true`; o sender do WhatsApp
**lança exceção** se receber uma conversa de teste (asserção rígida + unit test).
Juiz: UMA chamada por conversa (6 por execução), `judge_failed` excluído do score
`round(100 * (verdes + 0.5*amarillos) / casos_con_veredicto)`.

## DV-VC-09 — Mocks para self-test (wa-mock + ai-mock)

- **Interceptação por env**: `META_GRAPH_BASE_URL` → wa-mock/graph;
  `OPENROUTER_BASE_URL` → ai-mock. O código de produção não sabe que o mock existe.
- wa-mock assina os recebimentos com o `META_APP_SECRET` real e faz POST **loopback**
  (`http://127.0.0.1:PORT`, não a URL pública) ao webhook; outbox em memória (válido:
  mesmo processo Node). Overrides `waMessageId`/`timestamp` para testes de dedup e
  janela de 24h; token com sufixo `-invalid` → 401 code 190 (caminho infeliz do wizard).
- ai-mock: despacho determinístico por conteúdo (marcador `[JUEZ]` no prompt do
  juiz → veredictos fixos). Os E2E do Laboratório SEMPRE rodam contra o ai-mock
  (determinismo).
- Gate duplo: `WA_MOCK_ENABLED=true` **e** `NODE_ENV !== 'production'` → se não, 404
  (unit test). `WA_MOCK_ENABLED` não aparece no `.env.example`.

**Origem**: wa-mock adaptado do projeto de referência privado em produção (estendido
com overrides e ciclo de templates); ai-mock novo.

## DV-VC-10 — Env: validação lazy + placeholders de build

`getEnv()` lazy + memoizada (Zod). Durante `next build`
(`NEXT_PHASE === 'phase-production-build'`) são aceitos placeholders → os segredos são
**apenas runtime**, nunca build args (a imagem Docker é construída sem segredos).
**Origem**: projeto de referência privado em produção.

## DV-VC-11 — Docker: migrações no arranque, não pré-deploy

Multi-stage `node:22-alpine` + corepack pnpm + Next standalone. `migrate.mjs`
empacotado com esbuild (drizzle-orm/postgres-js/migrator, `max:1`,
`onnotice:()=>{}`). `CMD ["sh","-c","node migrate.mjs && node server.js"]` — migrar
no **boot do contêiner novo**: no Coolify o Pre-Deployment Command roda no
contêiner ANTIGO (gotcha real → colunas faltando). HEALTHCHECK `/api/health` com
`start-period` 40s (cobre a migração). Rota B: compose app+postgres+caddy, Caddy
com `{$DOMAIN}` (TLS automático).

## DV-VC-12 — Normalização de destinatários (México)

`normalizeRecipient`: se o número é `521` + 10 dígitos (13 no total) → `52` + últimos
10 (o `1` de celular legado provoca o erro 131030 da Meta ao enviar). Aplicar somente
ao **enviar**; armazenar o `wa_id` tal como chega. **Origem**: projeto de referência
privado em produção.

## DV-VC-13 — Detecção de token vencido

Resposta da Graph com status 401 / `code: 190` / `type: OAuthException` → estado
`reconnect_required` em `meta_credentials`; banner em Settings + envios bloqueados com
erro tipado (sem retentativas cegas).

## DV-VC-14 — Versões fixadas (stack)

`next ^15.1`, `react ^19`, `drizzle-orm ^0.38` + `drizzle-kit ^0.30`,
`better-auth ^1.1` (+ organization plugin), `zod ^3.24` (**não** v4 — breaking),
`tailwindcss ^3.4`, `postgres ^3.4`, `nanoid ^5` (IDs com prefixo), `vitest ^2.1`,
`@dnd-kit/core` (kanban), esbuild (bundle migrate), pnpm (packageManager fixado),
`"type": "module"`, Next 15: `after()` para pós-resposta, `params` como Promise.
Graph API `v25.0` por padrão (`META_GRAPH_API_VERSION` configurável).

## DV-VC-15 — Templates: modelo e envio

Uma variável no máximo (`{{1}}`), `countVariables` com `/\{\{\s*(\d+)\s*\}\}/g`. Envio:
payload `{ messaging_product, to, type: 'template', template: { name,
language: { code }, components?: [{ type: 'body', parameters: [{ type: 'text',
text }] }] } }`; apenas `approved` e com a variável se o body a tiver. Estado via
webhook (modo direto) **mais** sync via Graph (ambos os modos, cobre a limitação
DV-VC-04). Erros tipados → HTTP: `not_connected/reconnect_required → 409`,
`invalid/meta_error → 422`, `meta_unavailable → 503`, `not_found → 404`.
**Origem**: projeto de referência privado em produção.

## DV-VC-16 — Seed demo idempotente

"Ferretería El Martillo": DELETE com escopo na org demo em ordem inversa das FKs →
reinserir. KB com 1–2 lacunas INTENCIONAIS (garantias e devoluções) para que o
Laboratório demonstre achados reais na primeira execução; inclui uma execução de
exemplo salva. Executável por botão (somente com BD de domínio vazia) e
`pnpm seed:demo`.
