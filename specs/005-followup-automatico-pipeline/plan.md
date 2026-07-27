# Implementation Plan: Follow-up automático de pipeline

**Branch**: `005-followup-automatico-pipeline` | **Date**: 2026-07-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-followup-automatico-pipeline/spec.md`

## Summary

Configuración singular por organización (habilitado, etapa gatillo, intervalo,
mensaje, etapa de éxito, etapa de expiración, requiere documento) más un scheduler
in-process que corre cada N minutos (mismo patrón que el resto del trabajo en
segundo plano del proyecto — sin colas externas) para: enviar el recordatorio a
leads inactivos en la etapa gatillo, y expirar a los que no respondieron tras el
plazo de gracia. La detección de documento se resuelve de forma reactiva (en el
mismo momento de la ingesta del mensaje entrante), no por scheduler, para cumplir
SC-004. Reutiliza `sendText` para el envío y `lead.lastActivityAt` (ya existente)
como única fuente de "última actividad" — sin tracking nuevo para eso.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict + noUncheckedIndexedAccess), React 19

**Primary Dependencies**: Next.js 15, Drizzle ORM — todas ya en el proyecto. Sin
dependencias nuevas (nada de `node-cron`: un `setInterval` module-level alcanza,
igual que `scheduleAgentTurn`).

**Storage**: PostgreSQL vía Drizzle. Dos tablas nuevas: `pipelineFollowup`
(configuración, 1 fila por organización) y `followupSend` (registro/idempotencia).

**Testing**: Vitest (unit, para la lógica pura de elegibilidad de un lead) +
self-test E2E en vivo (Principio IX).

**Target Platform**: Node self-hosted, proceso único de larga duración (no
serverless) — el `setInterval` del scheduler vive mientras viva el proceso.

**Project Type**: Monolito Next.js existente.

**Performance Goals**: N/A — ciclo de revisión periódico de baja frecuencia
(minutos), no una ruta de alto tráfico.

**Constraints**: El intervalo de revisión del scheduler y el intervalo/mensaje de
follow-up MUST salir de configuración (env var para el primero, banco de datos
para el segundo) — nunca constantes de negocio en el código (regla explícita del
roadmap, ya en línea con el resto del proyecto).

**Scale/Scope**: pensado para el volumen de un negocio chico/mediano (decenas de
leads activos por etapa), coherente con el Principio VIII.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Seguridad de Datos**: sin secretos nuevos. PASS.
- **II. Soberanía**: scheduler in-process, sin colas externas, sin dependencias
  nuevas. PASS.
- **III. Multi-tenancy**: `pipelineFollowup`/`followupSend` llevan
  `organization_id` NOT NULL, queries vía `scoped()`. PASS.
- **IV. Idempotencia**: índice único parcial sobre `followupSend` (1 registro
  `pending`/`sent`-sin-resolver activo por lead a la vez) evita duplicar
  recordatorios; mismo patrón que `test_run_org_running_uq`. PASS.
- **V. Calidad Verificable**: gate típecheck+lint+build+test sin excepción. PASS
  (pendiente de ejecutar).
- **VI. Specs Antes de Código**: este plan y spec preceden la implementación. PASS.
- **VII. Trazabilidad**: el plazo de gracia = intervalo (asunción) documentado en
  spec.md → Assumptions. PASS.
- **VIII. Foco Vertical**: sirve directamente a "atender/organizar/convertir"
  leads de WhatsApp — no es un builder de flujos genérico (una sola transición
  configurable: gatillo → éxito/expiración). PASS.
- **IX. Verificación en Vivo**: el envío del recordatorio respeta el guardrail de
  sandbox `is_test` (reutiliza `sendText`, que ya lo aplica) — no se introduce un
  camino de envío nuevo sin ese guardrail. Self-test E2E en vivo antes de "Hecho".

Sin violaciones — no aplica Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/005-followup-automatico-pipeline/
├── plan.md
├── spec.md
├── data-model.md
├── tasks.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
├── lib/db/schema.ts                    # + pipelineFollowup, followupSend
├── server/
│   ├── pipeline/
│   │   ├── followup.ts                 # get/saveFollowupConfig, serialize
│   │   ├── followup-scheduler.ts       # startFollowupScheduler (setInterval), runFollowupCycle
│   │   └── followup-document.ts        # onInboundMedia (reactivo, llamado desde ingest.ts)
│   └── inbox/ingest.ts                 # + llamada a onInboundMedia cuando el mensaje es media
├── instrumentation-node.ts              # + startFollowupScheduler() en el arranque
├── app/api/pipeline/followup/route.ts   # GET/PUT config
└── components/pipeline/
    └── followup-manager.tsx             # modal de configuración (junto a StageManager)
```

**Structure Decision**: sigue el patrón `src/server/<dominio>/` +
`src/app/api/<dominio>/` ya establecido; el scheduler se registra en
`instrumentation-node.ts`, el único punto de arranque de trabajo en segundo plano
de vida larga que ya existe en el proyecto (hoy solo hace `cleanupOrphanRuns`).

## Complexity Tracking

*(vacío — no hay violaciones que justificar)*
