# Data Model: Campanhas de disparo em massa

## Entidades

### `campaign`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefixo `camp_` |
| `organizationId` | text NOT NULL FK → organization | scoped |
| `name` | text NOT NULL | |
| `channel` | enum `official` \| `unofficial` NOT NULL | |
| `templateId` | text NULL FK → template | somente canal oficial |
| `messageTemplate` | text NULL | somente canal não oficial; corpo com `{{variavel}}` |
| `sendIntervalMs` | integer NOT NULL default 5000 | sempre editável; guardrail rígido no não oficial |
| `status` | enum `draft` \| `sending` \| `sent` \| `cancelled` NOT NULL default `draft` | |
| `total` | integer NOT NULL default 0 | |
| `sent` | integer NOT NULL default 0 | inclui falhados já processados (ver `failed`) |
| `failed` | integer NOT NULL default 0 | |
| `cancelRequested` | boolean NOT NULL default false | o loop verifica isso entre cada envio |
| `startedAt` / `completedAt` | timestamp NULL | |
| `createdAt` | timestamp NOT NULL default now() | |

Índice: `(organizationId, createdAt)`.

### `campaign_recipient`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefixo `crc_` |
| `campaignId` | text NOT NULL FK → campaign (cascade) | |
| `organizationId` | text NOT NULL | scoped, desnormalizado para queries diretas |
| `phone` | text NOT NULL | tal como vem do CSV, normalizado |
| `variables` | jsonb NULL | `{"1": "valor"}` (oficial) ou `{"nome": "...", ...}` (não oficial) |
| `contactId` | text NULL FK → contact | preenchido ao processar |
| `conversationId` | text NULL FK → conversation | idem |
| `messageId` | text NULL FK → message | mensagem real enviada, se bem-sucedida |
| `status` | enum `pending` \| `sent` \| `failed` NOT NULL default `pending` | |
| `error` | text NULL | motivo se `failed` |
| `createdAt` | timestamp NOT NULL default now() | |

Índice: `(campaignId, status)`.

**Por que não reutilizar apenas `message`**: um destinatário pode falhar ANTES
que exista uma mensagem (ex.: telefone inválido, modelo rejeitado no meio do
caminho) — precisa de seu próprio status independente da mensagem.

## Contratos de API

Todas as rotas sob `withAuth`, scoped por `session.organizationId`, mesmos
padrões de erro (`apiError`) que o resto do projeto.

### `POST /api/campaigns/import-csv`

Body: `{ csvText: string }` (o arquivo é lido no cliente com `FileReader`, é
enviado como texto — sem upload de binários, sem storage novo).

Resposta: `{ validRows: {phone, variables}[], invalidRows: {line, reason}[],
detectedVariables: string[] }`. Nada é persistido — é apenas pré-visualização.

### `POST /api/campaigns`

Body: `{ name, channel: "official", templateId, csvText } | { name, channel:
"unofficial", messageTemplate, sendIntervalMs, riskAcknowledged: true, csvText }`.

- Valida modelo aprovado (oficial) ou canal conectado (não oficial).
- `riskAcknowledged` MUST ser `true` para não oficial (FR-005) — 422 se faltar.
- Faz o parsing do CSV (mesmo parser de `import-csv`), cria a campanha em
  `draft` + seus `campaign_recipient` em uma transação.

Resposta: `{ campaign }` (201).

### `GET /api/campaigns`

Lista campanhas da organização, mais recentes primeiro (FR-013).

### `GET /api/campaigns/[id]`

Detalhe + lista de destinatários (para a tabela do detalhe).

### `POST /api/campaigns/[id]/send`

- 409 se a campanha não estiver em `draft` (FR-011).
- Marca `status = "sending"`, `startedAt = now()`, retorna 200 imediatamente, e
  dispara o loop em segundo plano (não bloqueia a resposta HTTP) — mesmo padrão
  in-process do turno do agente (`src/server/ai/pipeline.ts`).
- O loop: para cada destinatário pendente → `getOrCreateContact` +
  `getOrCreateConversation` (fixando o `channel` da conversa para o canal da
  campanha) → conforme o canal, `sendTemplate(...)` ou (após fixar
  `conversation.channel = "unofficial"`) `sendText(...)` → atualiza o
  `campaign_recipient` e os contadores da campanha → publica `campaign.run` via
  SSE → aguarda `sendIntervalMs` → verifica `cancelRequested` antes do próximo.
- Ao terminar (ou cancelar), fixa o `status` final e `completedAt`.

### `POST /api/campaigns/[id]/cancel`

- 409 se a campanha não estiver em `sending`.
- Fixa `cancelRequested = true`; o próprio loop detecta isso e encerra
  (FR-010/SC-003).

## Evento SSE novo

`{ type: "campaign.run"; data: { campaignId, status, total, sent, failed } }` —
adicionado a `SseEvent` em `src/server/events/bus.ts`, mesmo padrão que `lab.run`.
