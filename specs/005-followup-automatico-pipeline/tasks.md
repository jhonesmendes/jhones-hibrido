---

description: "Task list for Sprint 3: follow-up automático de pipeline"
---

# Tasks: Follow-up automático de pipeline

**Input**: Design documents from `specs/005-followup-automatico-pipeline/`

**Prerequisites**: plan.md, data-model.md, spec.md

**Tests**: unitários para a lógica pura de elegibilidade (quem deve receber
lembrete / quem deve expirar); o restante via self-test E2E ao vivo.

## Phase 1: Setup — Schema

- [X] T001 Adicionar as tabelas `pipelineFollowup` e `followupSend` em
  `src/lib/db/schema.ts` (ver data-model.md) + prefixos `pfu`/`fus` em
  `src/lib/db/ids.ts`.
- [X] T002 `pnpm db:generate` → nova migração; aplicar com `pnpm db:migrate`.
- [X] T003 Adicionar `FOLLOWUP_SCHEDULER_INTERVAL_MS` a `src/lib/env.ts` (default
  razoável para prod, ex. 5 min) e documentar em `.env.example`.

**Checkpoint**: schema migrado.

---

## Phase 2: User Story 1 - Configurar o follow-up (Priority: P1) 🎯 MVP

- [X] T010 [US1] `src/server/pipeline/followup.ts`: `getFollowupConfig(orgId)`
  (devolve default se não existir linha), `saveFollowupConfig(orgId, input)`
  (valida `enabled ⇒ triggerStageId && message`, 422 se faltar), `serializeFollowup`.
- [X] T011 [US1] `src/app/api/pipeline/followup/route.ts`: GET/PUT.
- [X] T012 [US1] `src/components/pipeline/followup-manager.tsx`: modal com
  toggle habilitado, selects de etapa gatilho/sucesso/expiração (populados a partir de
  `stages` já carregadas em `PipelineClient`), input de intervalo (número + unidade),
  textarea de mensagem, checkbox "requer documento".
- [X] T013 [US1] Adicionar botão "Follow-up automático" em `pipeline-client.tsx`
  (junto a "Gerenciar etapas") que abre o modal.

**Checkpoint**: configuração persistente e verificável ao vivo.

---

## Phase 3: User Story 2 - Disparo automático (Priority: P1)

- [X] T020 [US2] `src/server/pipeline/followup-scheduler.ts`:
  `runFollowupCycle()` — para cada organização com `enabled=true`: query de
  leads elegíveis em `triggerStageId` (ver data-model.md → Lógica de
  elegibilidade, passo 1), `sendText(...)` para cada um, insere `followup_send`
  (`sent` ou `failed`), captura erros por lead sem abortar o ciclo (FR-009).
- [X] T021 [US2] `startFollowupScheduler()` no mesmo arquivo — `setInterval`
  module-level com guarda anti-registro-duplo via `globalThis` (mesmo padrão de
  `src/server/ai/pipeline.ts`).
- [X] T022 [US2] Encaixar `startFollowupScheduler()` em
  `src/instrumentation-node.ts` (junto a `cleanupOrphanRuns`).
- [X] T023 [US2] [P] Testes unitários da função pura de elegibilidade (extraída
  para poder testar sem BD) em `tests/unit/followup-eligibility.test.ts`: lead
  inativo por mais tempo que o intervalo → elegível; lead com lembrete já enviado desde sua
  última atividade → não elegível; lead que respondeu depois do lembrete →
  volta a ser elegível após um novo período de inatividade.

**Checkpoint**: lembrete dispara sozinho, sem duplicados.

---

## Phase 4: User Story 3 - Documento move para sucesso (Priority: P2)

- [X] T030 [US3] `src/server/pipeline/followup-document.ts`:
  `onInboundMedia(organizationId, contactId)` — se `requiresDocument` e o lead
  do contato estiver em `triggerStageId`: move para `successStageId`, cancela
  `followup_send` ativo desse lead.
- [X] T031 [US3] Encaixar `onInboundMedia` em `ingestInboundMessage`
  (`src/server/inbox/ingest.ts`) quando `MEDIA_TYPES.has(input.type)` e
  `!fromMe` (reaproveita o set já definido para `hasServableMedia`).

**Checkpoint**: documento move o cartão sem esperar o scheduler (SC-004).

---

## Phase 5: User Story 4 - Expiração automática (Priority: P3)

- [X] T040 [US4] Estender `runFollowupCycle()` (T020) com o passo 2 de
  elegibilidade (expirar leads sem resposta após o prazo de carência, ver
  data-model.md).
- [X] T041 [US4] [P] Teste unitário: lead com lembrete vencido e sem atividade
  nova → expira; lead que respondeu antes de vencer → não expira; sem
  `expiredStageId` configurado → não move nada, não falha.

**Checkpoint**: as 4 histórias completas.

---

## Phase 6: Polish

- [X] T050 [P] Gate técnico completo: `pnpm typecheck && pnpm lint && pnpm build
  && pnpm test`.
- [X] T051 Self-test E2E ao vivo (Princípio IX): configurar follow-up com
  intervalo bem curto (segundos, via override de teste) para poder observar o
  ciclo completo numa execução razoável — lembrete disparado, documento
  simulado movendo para sucesso, expiração de um lead sem resposta. Caminho infeliz:
  tentar habilitar sem etapa gatilho/mensagem.

## Dependencies & Execution Order

- Setup (T001-T003) bloqueia todo o resto.
- US1 (T010-T013) é pré-requisito de dados para US2/US3/US4 (precisam de uma
  configuração salva para ter algo a avaliar).
- US2 (T020-T023) e US3 (T030-T031) são independentes entre si uma vez que existe
  a config — podem ser implementadas em qualquer ordem.
- US4 (T040-T041) estende o mesmo `runFollowupCycle` de US2 — depende de T020.
- Polish depende das 4 histórias completas.

## Notes

- O scheduler para o self-test E2E precisa de um intervalo de verificação curto
  para observar o ciclo sem esperar minutos reais — usar
  `FOLLOWUP_SCHEDULER_INTERVAL_MS` baixo (ex. 2-3s) apenas no `.env` de
  desenvolvimento do self-test, nunca como default de produção.
- Reaproveita `sendText`, `lead.lastActivityAt`, o padrão `setInterval` +
  `globalThis` do turno do agente, e o mesmo `MEDIA_TYPES` de
  `server/inbox/ingest.ts` — zero lógica duplicada.

## Resultado do self-test E2E (2026-07-26)

Executado com Playwright real contra `pnpm dev` + Postgres local + wa-mock,
`FOLLOWUP_SCHEDULER_INTERVAL_MS=3000` apenas para esta execução. 12/12
asserções em verde:

- **Edge case**: habilitar sem etapa gatilho/mensagem → 422.
- **US1**: configurado e salvo a partir da UI real; persiste ao recarregar.
- **US3**: documento recebido moveu o lead para a etapa de sucesso no mesmo
  ciclo de ingestão (sem esperar o scheduler, SC-004 confirmado).
- **US2**: lembrete disparado sozinho pelo scheduler sobre um lead
  com data retroativa de 2h inativo; zero duplicados no ciclo seguinte (SC-003).
- **US4**: retroagindo de forma consistente `lead.lastActivityAt` e
  `followup_send.sentAt` (mesmo intervalo relativo, ambos mais atrás no
  tempo) para simular o prazo de carência vencido, o lead expirou sozinho para a
  etapa configurada.

Nota de depuração real encontrada durante o self-test: retroagir SOMENTE
`sentAt` sem mover também `lastActivityAt` inverte a cronologia e
introduz um falso "o cliente respondeu depois" — é preciso retroagir
ambos os timestamps de forma consistente ao simular tempo decorrido para
esta feature.

Gate técnico: typecheck + lint + build + test (115/115, inclui 14 testes
novos de elegibilidade) em verde.
