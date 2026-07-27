---

description: "Task list for Sprint 2: campañas de disparo en masa"
---

# Tasks: Campañas de disparo en masa

**Input**: Design documents from `specs/004-campanhas-disparo-massa/`

**Prerequisites**: plan.md, data-model.md, spec.md

**Tests**: se agregan tests unitarios para el parser de CSV y el render de
variables (lógica pura, fácil de romper en silencio); el resto se verifica con el
self-test E2E en vivo del Principio IX.

## Phase 1: Setup — Schema

- [X] T001 Agregar tablas `campaign` y `campaignRecipient` en
  `src/lib/db/schema.ts` (ver data-model.md), + prefijos `camp`/`crc` en
  `src/lib/db/ids.ts`.
- [X] T002 `pnpm db:generate` → nueva migración en `drizzle/`; aplicar con
  `pnpm db:migrate` contra el Postgres local de desarrollo.
- [X] T003 [P] Agregar el evento `campaign.run` a `SseEvent` en
  `src/server/events/bus.ts` y su handler `onCampaignRun` en
  `src/components/use-events.ts`.

**Checkpoint**: schema migrado, tipos disponibles.

---

## Phase 2: User Story 1 - Campaña oficial (Priority: P1) 🎯 MVP

**Goal**: crear y disparar una campaña oficial con una plantilla aprobada + CSV,
ver el progreso en vivo.

### Implementation for User Story 1

- [X] T010 [US1] `src/lib/campaigns/csv.ts`: `parseRecipientsCsv(csvText, {
  variableNames? })` — primera columna teléfono (normalizado con la misma regla
  que `normalizePhoneInput`), resto columnas = variables por nombre de header;
  devuelve `{ validRows, invalidRows }`. Sin librería nueva (parser manual, CSV
  simple sin comillas anidadas — alcance suficiente para v1).
- [X] T011 [US1] `src/app/api/campaigns/import-csv/route.ts`: POST que llama al
  parser y devuelve la previsualización (sin persistir).
- [X] T012 [US1] `src/server/campaigns/create.ts`: `createCampaign(organizationId,
  input)` — valida plantilla aprobada (canal oficial) vía el mismo query que ya
  usa `sendTemplate`; inserta `campaign` + sus `campaignRecipient` en una
  transacción Drizzle.
- [X] T013 [US1] `src/app/api/campaigns/route.ts`: GET (listar, FR-013) y POST
  (crear, delega a T012).
- [X] T014 [US1] `src/server/campaigns/queries.ts`: `listCampaigns`,
  `getCampaignWithRecipients`, `serializeCampaign`.
- [X] T015 [US1] `src/app/api/campaigns/[id]/route.ts`: GET detalle +
  destinatarios.
- [X] T016 [US1] `src/server/campaigns/send.ts`: `runCampaign(campaignId)` — loop
  in-process (mismo patrón que `src/server/ai/pipeline.ts`): por destinatario
  pendiente → `getOrCreateContact`/`getOrCreateConversation` → `sendTemplate(...)`
  (canal oficial) → actualiza `campaign_recipient` + contadores de `campaign` →
  publica `campaign.run` → espera `sendIntervalMs` → revisa `cancelRequested`.
  Captura errores por destinatario sin abortar el loop (FR-008).
- [X] T017 [US1] `src/app/api/campaigns/[id]/send/route.ts`: POST — 409 si no está
  en `draft` (FR-011), marca `sending`, dispara `runCampaign` sin esperarlo
  (`void runCampaign(id)`), responde 200 de inmediato.
- [X] T018 [US1] `src/components/campaigns/campaigns-client.tsx`: listado +
  modal de creación (elegir canal, plantilla si oficial, subir CSV vía
  `FileReader`, previsualización, confirmar).
- [X] T019 [US1] `src/components/campaigns/campaign-detail-client.tsx`: detalle
  con contadores en vivo (`useEvents` → `onCampaignRun`), botón "Disparar"
  (deshabilitado fuera de `draft`).
- [X] T020 [US1] `src/app/(app)/campanhas/page.tsx` + `[id]/page.tsx`; agregar
  entrada "Campanhas" (ícono `Megaphone`) en `src/components/app-nav.tsx`.
- [X] T021 [US1] [P] Tests unitarios de `parseRecipientsCsv` en
  `tests/unit/campaigns-csv.test.ts` (CSV válido, teléfono inválido, columna de
  variable faltante, CSV vacío).

**Checkpoint**: US1 disparable y verificable en vivo de forma independiente.

---

## Phase 3: User Story 2 - Campaña no oficial (Priority: P2)

**Goal**: mensaje libre con variables nombradas, aviso de riesgo obligatorio,
intervalo configurable.

### Implementation for User Story 2

- [X] T030 [US2] `src/lib/campaigns/render.ts`: `renderMessage(template, vars)` y
  `extractVariables(template)` (regex `\{\{(\w+)\}\}`, dedupe).
- [X] T031 [US2] [P] Tests unitarios de `render.ts` en
  `tests/unit/campaigns-render.test.ts` (sustitución simple, variable faltante
  deja el placeholder, extracción de nombres duplicados).
- [X] T032 [US2] Extender `createCampaign` (T012) para canal no oficial: valida
  canal conectado (`getChannelByOrg`), exige `riskAcknowledged === true` (422 si
  falta, FR-005), usa `extractVariables` para mapear columnas del CSV en vez de
  asumir `{{1}}`.
- [X] T033 [US2] Extender `runCampaign` (T016): para canal no oficial, al
  crear/reutilizar la conversación del destinatario fija
  `conversation.channel = "unofficial"` (si no lo era ya) y llama
  `renderMessage(campaign.messageTemplate, recipient.variables)` seguido de
  `sendText(...)` (que ya rutea a `sendViaUnofficial` por el channel de la
  conversación) — reusa el primitivo existente, no lo duplica.
- [X] T034 [US2] En `campaigns-client.tsx`: paso de canal no oficial con textarea
  libre + detección en vivo de variables usadas, checkbox obligatorio de aviso de
  riesgo de baneo (no se puede confirmar sin marcarlo), campo de intervalo
  (ms/segundos) con valor por defecto, deshabilitado si el canal no oficial no
  está conectado (mensaje explicando cómo conectarlo).

**Checkpoint**: US2 disparable y verificable en vivo de forma independiente.

---

## Phase 4: User Story 3 - Seguimiento y cancelación (Priority: P3)

- [X] T040 [US3] `src/server/campaigns/send.ts`: `cancelCampaign(organizationId,
  campaignId)` — 409 si no está `sending`, fija `cancelRequested = true`.
- [X] T041 [US3] `src/app/api/campaigns/[id]/cancel/route.ts`: POST.
- [X] T042 [US3] En `campaign-detail-client.tsx`: botón "Cancelar" visible solo en
  `sending`; tras cancelar, deshabilita disparo/cancelación (FR-011 simétrico).
- [X] T043 [US3] En `campaigns-client.tsx` (listado): mostrar estado + métricas
  por campaña (T014 ya las serializa).

**Checkpoint**: las 3 historias completas y verificadas.

---

## Phase 5: Polish

- [X] T050 [P] Gate técnico completo: `pnpm typecheck && pnpm lint && pnpm build
  && pnpm test`.
- [X] T051 Self-test E2E en vivo (Principio IX): campaña oficial de punta a punta
  (US1), campaña no oficial con canal no oficial conectado vía mock/gateway de
  prueba si el entorno lo permite (US2), cancelación a mitad de camino (US3),
  caminos infelices (plantilla no aprobada, canal no oficial no conectado, CSV con
  filas inválidas, doble disparo).

## Dependencies & Execution Order

- Setup (T001-T003) bloquea todo lo demás.
- US1 (T010-T021) es el camino crítico — US2 y US3 extienden el mismo código
  (`create.ts`, `send.ts`, `campaigns-client.tsx`) en vez de archivos nuevos, así
  que en la práctica se implementan en secuencia sobre la base de US1, no en
  paralelo.
- Dentro de US1: T010→T011; T012 depende de T001; T016 depende de T012/T014;
  T017 depende de T016; T018-T020 dependen de T013/T015/T017 (necesitan la API).
- Polish (T050-T051) depende de las 3 historias completas.

## Notes

- Reutiliza agresivamente: `sendTemplate`, `sendText`, `getOrCreateContact`,
  `getOrCreateConversation`, el bus SSE y el patrón in-process del agente — cero
  lógica de envío duplicada.
- Sin librería de CSV nueva, sin cola externa, sin scheduler persistente (fuera de
  alcance, ver spec.md → Assumptions).

## Resultado del self-test E2E (2026-07-26)

Ejecutado con Playwright real contra `pnpm dev` + Postgres local + wa-mock
(agente de IA desactivado a propósito). 13/13 aserciones en verde:

- **US1 completo de punta a punta**: formulario exige plantilla aprobada, CSV con
  fila inválida detectada en la previsualización, campaña creada, disparada,
  llegó a "Enviada" en vivo (SSE, sin recargar), destinatarios marcados
  "Enviado", los 2 envíos verificados en el outbox del canal oficial (mock).
- **US2 — guardrails verificados en vivo** (sin un gateway no oficial real
  disponible en este entorno, así que el ENVÍO real por ese canal queda
  **pendiente de verificación humana** con un gateway de prueba real): sin
  confirmar el riesgo el botón queda deshabilitado; confirmándolo pero sin canal
  conectado, sigue deshabilitado con el aviso de conectar el canal visible.
- **US3 completo**: campaña de 20 destinatarios disparada, cancelada a mitad de
  camino, quedó en "Cancelada" sin ofrecer más acciones de disparo/cancelación.
- **Edge cases**: plantilla no aprobada → 422; canal no oficial no conectado →
  409; redisparar una campaña ya procesada → 409.

Gate técnico: typecheck + lint + build + test (101/101) en verde. Nota de
entorno: `pnpm test` con paralelismo de archivos por defecto mostró 2 timeouts
intermitentes en tests preexistentes no relacionados
(`lab-sandbox.test.ts`/`send-sandbox.test.ts`) por contención de recursos de esta
sesión (Docker Desktop + muchas corridas de Playwright); confirmado como
ambiental, no regresión: ambos pasan en <3s aislados y la suite completa pasa
101/101 con `vitest run --no-file-parallelism`.
