---

description: "Task list for Sprint 2: campanhas de disparo em massa"
---

# Tasks: Campanhas de disparo em massa

**Input**: Design documents from `specs/004-campanhas-disparo-massa/`

**Prerequisites**: plan.md, data-model.md, spec.md

**Tests**: são adicionados testes unitários para o parser de CSV e a renderização de
variáveis (lógica pura, fácil de quebrar em silêncio); o restante é verificado com o
self-test E2E ao vivo do Princípio IX.

## Phase 1: Setup — Schema

- [X] T001 Adicionar as tabelas `campaign` e `campaignRecipient` em
  `src/lib/db/schema.ts` (ver data-model.md), + prefixos `camp`/`crc` em
  `src/lib/db/ids.ts`.
- [X] T002 `pnpm db:generate` → nova migração em `drizzle/`; aplicar com
  `pnpm db:migrate` contra o Postgres local de desenvolvimento.
- [X] T003 [P] Adicionar o evento `campaign.run` a `SseEvent` em
  `src/server/events/bus.ts` e seu handler `onCampaignRun` em
  `src/components/use-events.ts`.

**Checkpoint**: schema migrado, tipos disponíveis.

---

## Phase 2: User Story 1 - Campanha oficial (Priority: P1) 🎯 MVP

**Goal**: criar e disparar uma campanha oficial com um modelo aprovado + CSV,
ver o progresso ao vivo.

### Implementation for User Story 1

- [X] T010 [US1] `src/lib/campaigns/csv.ts`: `parseRecipientsCsv(csvText, {
  variableNames? })` — primeira coluna telefone (normalizado com a mesma regra
  de `normalizePhoneInput`), demais colunas = variáveis por nome de header;
  devolve `{ validRows, invalidRows }`. Sem biblioteca nova (parser manual, CSV
  simples sem aspas aninhadas — escopo suficiente para v1).
- [X] T011 [US1] `src/app/api/campaigns/import-csv/route.ts`: POST que chama o
  parser e devolve a pré-visualização (sem persistir).
- [X] T012 [US1] `src/server/campaigns/create.ts`: `createCampaign(organizationId,
  input)` — valida modelo aprovado (canal oficial) via a mesma query já usada
  por `sendTemplate`; insere `campaign` + seus `campaignRecipient` numa
  transação Drizzle.
- [X] T013 [US1] `src/app/api/campaigns/route.ts`: GET (listar, FR-013) e POST
  (criar, delega a T012).
- [X] T014 [US1] `src/server/campaigns/queries.ts`: `listCampaigns`,
  `getCampaignWithRecipients`, `serializeCampaign`.
- [X] T015 [US1] `src/app/api/campaigns/[id]/route.ts`: GET detalhe +
  destinatários.
- [X] T016 [US1] `src/server/campaigns/send.ts`: `runCampaign(campaignId)` — loop
  in-process (mesmo padrão de `src/server/ai/pipeline.ts`): por destinatário
  pendente → `getOrCreateContact`/`getOrCreateConversation` → `sendTemplate(...)`
  (canal oficial) → atualiza `campaign_recipient` + contadores de `campaign` →
  publica `campaign.run` → aguarda `sendIntervalMs` → verifica `cancelRequested`.
  Captura erros por destinatário sem abortar o loop (FR-008).
- [X] T017 [US1] `src/app/api/campaigns/[id]/send/route.ts`: POST — 409 se não
  estiver em `draft` (FR-011), marca `sending`, dispara `runCampaign` sem
  esperar por ele (`void runCampaign(id)`), responde 200 imediatamente.
- [X] T018 [US1] `src/components/campaigns/campaigns-client.tsx`: listagem +
  modal de criação (escolher canal, modelo se oficial, subir CSV via
  `FileReader`, pré-visualização, confirmar).
- [X] T019 [US1] `src/components/campaigns/campaign-detail-client.tsx`: detalhe
  com contadores ao vivo (`useEvents` → `onCampaignRun`), botão "Disparar"
  (desabilitado fora de `draft`).
- [X] T020 [US1] `src/app/(app)/campanhas/page.tsx` + `[id]/page.tsx`; adicionar
  entrada "Campanhas" (ícone `Megaphone`) em `src/components/app-nav.tsx`.
- [X] T021 [US1] [P] Testes unitários de `parseRecipientsCsv` em
  `tests/unit/campaigns-csv.test.ts` (CSV válido, telefone inválido, coluna de
  variável faltando, CSV vazio).

**Checkpoint**: US1 disparável e verificável ao vivo de forma independente.

---

## Phase 3: User Story 2 - Campanha não oficial (Priority: P2)

**Goal**: mensagem livre com variáveis nomeadas, aviso de risco obrigatório,
intervalo configurável.

### Implementation for User Story 2

- [X] T030 [US2] `src/lib/campaigns/render.ts`: `renderMessage(template, vars)` e
  `extractVariables(template)` (regex `\{\{(\w+)\}\}`, dedupe).
- [X] T031 [US2] [P] Testes unitários de `render.ts` em
  `tests/unit/campaigns-render.test.ts` (substituição simples, variável
  faltando mantém o placeholder, extração de nomes duplicados).
- [X] T032 [US2] Estender `createCampaign` (T012) para canal não oficial: valida
  canal conectado (`getChannelByOrg`), exige `riskAcknowledged === true` (422 se
  faltar, FR-005), usa `extractVariables` para mapear colunas do CSV em vez de
  assumir `{{1}}`.
- [X] T033 [US2] Estender `runCampaign` (T016): para canal não oficial, ao
  criar/reutilizar a conversa do destinatário fixa
  `conversation.channel = "unofficial"` (se ainda não fosse) e chama
  `renderMessage(campaign.messageTemplate, recipient.variables)` seguido de
  `sendText(...)` (que já roteia para `sendViaUnofficial` pelo channel da
  conversa) — reaproveita o primitivo existente, não o duplica.
- [X] T034 [US2] Em `campaigns-client.tsx`: passo de canal não oficial com
  textarea livre + detecção ao vivo das variáveis usadas, checkbox obrigatório
  do aviso de risco de banimento (não é possível confirmar sem marcá-lo), campo
  de intervalo (ms/segundos) com valor padrão, desabilitado se o canal não
  oficial não estiver conectado (mensagem explicando como conectá-lo).

**Checkpoint**: US2 disparável e verificável ao vivo de forma independente.

---

## Phase 4: User Story 3 - Acompanhamento e cancelamento (Priority: P3)

- [X] T040 [US3] `src/server/campaigns/send.ts`: `cancelCampaign(organizationId,
  campaignId)` — 409 se não estiver `sending`, fixa `cancelRequested = true`.
- [X] T041 [US3] `src/app/api/campaigns/[id]/cancel/route.ts`: POST.
- [X] T042 [US3] Em `campaign-detail-client.tsx`: botão "Cancelar" visível
  apenas em `sending`; após cancelar, desabilita disparo/cancelamento (FR-011
  simétrico).
- [X] T043 [US3] Em `campaigns-client.tsx` (listagem): mostrar status + métricas
  por campanha (T014 já as serializa).

**Checkpoint**: as 3 histórias completas e verificadas.

---

## Phase 5: Polish

- [X] T050 [P] Gate técnico completo: `pnpm typecheck && pnpm lint && pnpm build
  && pnpm test`.
- [X] T051 Self-test E2E ao vivo (Princípio IX): campanha oficial de ponta a
  ponta (US1), campanha não oficial com canal não oficial conectado via
  mock/gateway de teste se o ambiente permitir (US2), cancelamento no meio do
  caminho (US3), caminhos infelizes (modelo não aprovado, canal não oficial não
  conectado, CSV com linhas inválidas, disparo duplicado).

## Dependencies & Execution Order

- Setup (T001-T003) bloqueia todo o resto.
- US1 (T010-T021) é o caminho crítico — US2 e US3 estendem o mesmo código
  (`create.ts`, `send.ts`, `campaigns-client.tsx`) em vez de arquivos novos,
  então na prática são implementadas em sequência sobre a base de US1, não em
  paralelo.
- Dentro de US1: T010→T011; T012 depende de T001; T016 depende de T012/T014;
  T017 depende de T016; T018-T020 dependem de T013/T015/T017 (precisam da API).
- Polish (T050-T051) depende das 3 histórias completas.

## Notes

- Reaproveita agressivamente: `sendTemplate`, `sendText`, `getOrCreateContact`,
  `getOrCreateConversation`, o bus SSE e o padrão in-process do agente — zero
  lógica de envio duplicada.
- Sem biblioteca de CSV nova, sem fila externa, sem scheduler persistente (fora
  de escopo, ver spec.md → Assumptions).

## Resultado do self-test E2E (2026-07-26)

Executado com Playwright real contra `pnpm dev` + Postgres local + wa-mock
(agente de IA desativado de propósito). 13/13 asserções em verde:

- **US1 completo de ponta a ponta**: formulário exige modelo aprovado, CSV com
  linha inválida detectada na pré-visualização, campanha criada, disparada,
  chegou a "Enviada" ao vivo (SSE, sem recarregar), destinatários marcados
  "Enviado", os 2 envios verificados no outbox do canal oficial (mock).
- **US2 — guardrails verificados ao vivo** (sem um gateway não oficial real
  disponível neste ambiente, então o ENVIO real por esse canal fica
  **pendente de verificação humana** com um gateway de teste real): sem
  confirmar o risco, o botão fica desabilitado; confirmando-o mas sem canal
  conectado, continua desabilitado com o aviso de conectar o canal visível.
- **US3 completo**: campanha de 20 destinatários disparada, cancelada no meio
  do caminho, ficou em "Cancelada" sem oferecer mais ações de disparo/cancelamento.
- **Edge cases**: modelo não aprovado → 422; canal não oficial não conectado →
  409; redisparar uma campanha já processada → 409.

Gate técnico: typecheck + lint + build + test (101/101) em verde. Nota de
ambiente: `pnpm test` com paralelismo de arquivos padrão mostrou 2 timeouts
intermitentes em testes preexistentes não relacionados
(`lab-sandbox.test.ts`/`send-sandbox.test.ts`) por contenção de recursos desta
sessão (Docker Desktop + muitas execuções de Playwright); confirmado como
ambiental, não regressão: ambos passam em <3s isolados e a suite completa passa
101/101 com `vitest run --no-file-parallelism`.
