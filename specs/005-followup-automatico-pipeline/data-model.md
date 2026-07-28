# Data Model: Follow-up automático de pipeline

## Entidades

### `pipeline_followup` (1 linha por organização, como `agent_profile`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefixo `pfu_` |
| `organizationId` | text NOT NULL UNIQUE FK → organization | scoped, singleton |
| `enabled` | boolean NOT NULL default false | |
| `triggerStageId` | text NULL FK → pipeline_stage | etapa que ativa o follow-up |
| `intervalValue` | integer NOT NULL default 4 | |
| `intervalUnit` | enum `hours` \| `days` NOT NULL default `hours` | |
| `message` | text NULL | mensagem configurável, sem nada fixo |
| `successStageId` | text NULL FK → pipeline_stage | ao receber documento (se aplicável) |
| `expiredStageId` | text NULL FK → pipeline_stage | ao vencer o prazo de carência |
| `requiresDocument` | boolean NOT NULL default false | |
| `updatedAt` | timestamp NOT NULL default now() | |

### `followup_send` (registro/idempotência — não é uma fila com data futura;
é criado no momento em que o lembrete efetivamente é enviado)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefixo `fus_` |
| `organizationId` | text NOT NULL | scoped |
| `leadId` | text NOT NULL FK → lead (cascade) | |
| `conversationId` | text NOT NULL FK → conversation | |
| `message` | text NOT NULL | cópia da mensagem enviada (auditoria; se
  a config for editada depois, não muda o histórico) |
| `status` | enum `sent` \| `failed` \| `cancelled` \| `expired` NOT NULL | não há
  `pending`: já é criado com o resultado da tentativa de envio |
| `sentAt` | timestamp NOT NULL default now() | |
| `resolvedAt` | timestamp NULL | quando passou para `cancelled`/`expired` |

Índice: `uniqueIndex("followup_send_lead_active_uq").on(leadId).where(status IN
('sent'))` — no máximo um lembrete "ativo" (aguardando resolução) por lead
por vez; ver Lógica de elegibilidade abaixo para como se permite um novo depois
de resolvido.

## Lógica de elegibilidade (server/pipeline/followup-scheduler.ts)

Para cada organização com `pipeline_followup.enabled = true`:

1. **Enviar lembrete**: leads com `stageId = triggerStageId` AND
   `lead.lastActivityAt < now() - interval` AND sem uma linha `followup_send` com
   `status = 'sent'` cujo `sentAt > lead.lastActivityAt` (ou seja: ele ainda não
   recebeu lembrete desde sua última atividade — se respondeu depois de um lembrete
   antigo, esse lembrete deixa de "contar" e pode receber um novo na próxima
   vez que ficar inativo). → enviar `sendText(...)`, inserir `followup_send`
   (`status: 'sent'` em sucesso, `'failed'` se `sendText` lançar erro — não é feita
   nova tentativa no mesmo ciclo, mas sim no seguinte).
2. **Expirar**: leads com `stageId = triggerStageId` AND uma linha `followup_send`
   `status = 'sent'` com `sentAt < now() - interval` (mesmo intervalo = prazo de
   carência, ver spec.md → Assumptions) AND `lead.lastActivityAt <= followup_send.sentAt`
   (sem atividade nova desde o envio) → se `expiredStageId` estiver configurado,
   mover `lead.stageId = expiredStageId` e marcar o `followup_send`
   `status = 'expired'`, `resolvedAt = now()`.

## Lógica reativa (server/pipeline/followup-document.ts, chamada desde
`ingestInboundMessage` em `server/inbox/ingest.ts` quando a mensagem recebida é
do tipo mídia)

Se `pipeline_followup.requiresDocument = true` AND o lead do contato estiver em
`triggerStageId` → mover `lead.stageId = successStageId` (se configurado) e
marcar qualquer `followup_send` `status = 'sent'` desse lead como `'cancelled'`
(`resolvedAt = now()`).

## Contratos de API

### `GET /api/pipeline/followup`

Devolve a configuração da organização (ou os valores padrão se nunca
foi salva nenhuma).

### `PUT /api/pipeline/followup`

Body: `{ enabled, triggerStageId, intervalValue, intervalUnit, message,
successStageId, expiredStageId, requiresDocument }`.

- Se `enabled = true`: `triggerStageId` e `message` (não vazio) MUST estar
  presentes (FR-001/acceptance #4) — 422 se faltarem.
- Upsert por `organizationId` (como `agent_profile`).

## Inicialização do scheduler

`src/instrumentation-node.ts` (inicialização única do processo) chama
`startFollowupScheduler()`, que registra um `setInterval` module-level (mesmo
padrão anti-registro-duplo de `scheduleAgentTurn` via `globalThis`) com período
`FOLLOWUP_SCHEDULER_INTERVAL_MS` (env var, default 5 min). Cada tick percorre todas
as organizações com `pipeline_followup.enabled = true` e roda a lógica de
elegibilidade acima.
