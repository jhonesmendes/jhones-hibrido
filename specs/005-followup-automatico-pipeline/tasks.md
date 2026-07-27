---

description: "Task list for Sprint 3: follow-up automático de pipeline"
---

# Tasks: Follow-up automático de pipeline

**Input**: Design documents from `specs/005-followup-automatico-pipeline/`

**Prerequisites**: plan.md, data-model.md, spec.md

**Tests**: unitarios para la lógica pura de elegibilidad (quién debe recibir
recordatorio / quién debe expirar); el resto vía self-test E2E en vivo.

## Phase 1: Setup — Schema

- [X] T001 Agregar tablas `pipelineFollowup` y `followupSend` en
  `src/lib/db/schema.ts` (ver data-model.md) + prefijos `pfu`/`fus` en
  `src/lib/db/ids.ts`.
- [X] T002 `pnpm db:generate` → migración nueva; aplicar con `pnpm db:migrate`.
- [X] T003 Agregar `FOLLOWUP_SCHEDULER_INTERVAL_MS` a `src/lib/env.ts` (default
  razonable para prod, p. ej. 5 min) y documentar en `.env.example`.

**Checkpoint**: schema migrado.

---

## Phase 2: User Story 1 - Configurar el follow-up (Priority: P1) 🎯 MVP

- [X] T010 [US1] `src/server/pipeline/followup.ts`: `getFollowupConfig(orgId)`
  (devuelve default si no existe fila), `saveFollowupConfig(orgId, input)`
  (valida `enabled ⇒ triggerStageId && message`, 422 si falta), `serializeFollowup`.
- [X] T011 [US1] `src/app/api/pipeline/followup/route.ts`: GET/PUT.
- [X] T012 [US1] `src/components/pipeline/followup-manager.tsx`: modal con
  toggle habilitado, selects de etapa gatillo/éxito/expiración (poblados desde
  `stages` ya cargadas en `PipelineClient`), input de intervalo (número + unidad),
  textarea de mensaje, checkbox "requiere documento".
- [X] T013 [US1] Agregar botón "Follow-up automático" en `pipeline-client.tsx`
  (junto a "Gerenciar etapas") que abre el modal.

**Checkpoint**: configuración persistente y verificable en vivo.

---

## Phase 3: User Story 2 - Disparo automático (Priority: P1)

- [X] T020 [US2] `src/server/pipeline/followup-scheduler.ts`:
  `runFollowupCycle()` — para cada organización con `enabled=true`: query de
  leads elegibles en `triggerStageId` (ver data-model.md → Lógica de
  elegibilidad, paso 1), `sendText(...)` por cada uno, inserta `followup_send`
  (`sent` o `failed`), captura errores por lead sin abortar el ciclo (FR-009).
- [X] T021 [US2] `startFollowupScheduler()` en el mismo archivo — `setInterval`
  module-level con guardia anti-doble-registro vía `globalThis` (mismo patrón que
  `src/server/ai/pipeline.ts`).
- [X] T022 [US2] Enganchar `startFollowupScheduler()` en
  `src/instrumentation-node.ts` (junto a `cleanupOrphanRuns`).
- [X] T023 [US2] [P] Tests unitarios de la función pura de elegibilidad (extraída
  para poder testear sin BD) en `tests/unit/followup-eligibility.test.ts`: lead
  inactivo más del intervalo → elegible; lead con recordatorio ya enviado desde su
  última actividad → no elegible; lead que respondió después del recordatorio →
  vuelve a ser elegible tras un nuevo período de inactividad.

**Checkpoint**: recordatorio se dispara solo, sin duplicados.

---

## Phase 4: User Story 3 - Documento mueve a éxito (Priority: P2)

- [X] T030 [US3] `src/server/pipeline/followup-document.ts`:
  `onInboundMedia(organizationId, contactId)` — si `requiresDocument` y el lead
  del contacto está en `triggerStageId`: mueve a `successStageId`, cancela
  `followup_send` activo de ese lead.
- [X] T031 [US3] Enganchar `onInboundMedia` en `ingestInboundMessage`
  (`src/server/inbox/ingest.ts`) cuando `MEDIA_TYPES.has(input.type)` y
  `!fromMe` (reutiliza el set ya definido para `hasServableMedia`).

**Checkpoint**: documento mueve la tarjeta sin esperar al scheduler (SC-004).

---

## Phase 5: User Story 4 - Expiración automática (Priority: P3)

- [X] T040 [US4] Extender `runFollowupCycle()` (T020) con el paso 2 de
  elegibilidad (expirar leads sin respuesta tras el plazo de gracia, ver
  data-model.md).
- [X] T041 [US4] [P] Test unitario: lead con recordatorio vencido y sin actividad
  nueva → expira; lead que respondió antes de vencer → no expira; sin
  `expiredStageId` configurado → no mueve nada, no falla.

**Checkpoint**: las 4 historias completas.

---

## Phase 6: Polish

- [X] T050 [P] Gate técnico completo: `pnpm typecheck && pnpm lint && pnpm build
  && pnpm test`.
- [X] T051 Self-test E2E en vivo (Principio IX): configurar follow-up con
  intervalo muy corto (segundos, vía override de test) para poder observar el
  ciclo completo en una corrida razonable — recordatorio disparado, documento
  simulado moviendo a éxito, expiración de un lead sin respuesta. Camino infeliz:
  intentar habilitar sin etapa gatillo/mensaje.

## Dependencies & Execution Order

- Setup (T001-T003) bloquea todo lo demás.
- US1 (T010-T013) es prerrequisito de datos para US2/US3/US4 (necesitan una
  configuración guardada para tener algo que evaluar).
- US2 (T020-T023) y US3 (T030-T031) son independientes entre sí una vez que existe
  la config — pueden implementarse en cualquier orden.
- US4 (T040-T041) extiende el mismo `runFollowupCycle` de US2 — depende de T020.
- Polish depende de las 4 historias completas.

## Notes

- El scheduler para el self-test E2E necesita un intervalo de revisión corto para
  observar el ciclo sin esperar minutos reales — usar
  `FOLLOWUP_SCHEDULER_INTERVAL_MS` bajo (p. ej. 2-3s) solo en el `.env` de
  desarrollo del self-test, nunca como default de producción.
- Reutiliza `sendText`, `lead.lastActivityAt`, el patrón `setInterval` +
  `globalThis` del turno del agente, y el mismo `MEDIA_TYPES` de
  `server/inbox/ingest.ts` — cero lógica duplicada.

## Resultado del self-test E2E (2026-07-26)

Ejecutado con Playwright real contra `pnpm dev` + Postgres local + wa-mock,
`FOLLOWUP_SCHEDULER_INTERVAL_MS=3000` solo para esta corrida. 12/12
aserciones en verde:

- **Edge case**: habilitar sin etapa gatillo/mensaje → 422.
- **US1**: configurado y guardado desde la UI real; persiste al recargar.
- **US3**: documento entrante movió el lead a la etapa de éxito en el mismo
  ciclo de ingesta (sin esperar al scheduler, SC-004 confirmado).
- **US2**: recordatorio disparado solo por el scheduler sobre un lead
  backdateado 2h inactivo; cero duplicados en el ciclo siguiente (SC-003).
- **US4**: backdateando de forma consistente `lead.lastActivityAt` y
  `followup_send.sentAt` (mismo intervalo relativo, ambos más atrás en el
  tiempo) para simular el plazo de gracia vencido, el lead expiró solo a la
  etapa configurada.

Nota de depuración real encontrada durante el self-test: backdatear SOLO
`sentAt` sin mover también `lastActivityAt` invierte la cronología e
introduce un falso "el cliente respondió después" — hay que backdatear
ambos timestamps de forma consistente al simular tiempo transcurrido para
esta feature.

Gate técnico: typecheck + lint + build + test (115/115, incluye 14 tests
nuevos de elegibilidad) en verde.
