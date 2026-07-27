# Implementation Plan: Campañas de disparo en masa

**Branch**: `004-campanhas-disparo-massa` | **Date**: 2026-07-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-campanhas-disparo-massa/spec.md`

## Summary

Nueva feature de dominio: campañas de disparo en masa hacia contactos importados por
CSV, en dos modos (oficial vía plantilla aprobada + variable {{1}}; no oficial vía
texto libre con variables nombradas). El disparo se ejecuta en segundo plano dentro
del mismo proceso Node (mismo patrón que el turno del agente y el runner del
Laboratorio — sin colas externas, Constitución II), reutilizando `sendTemplate` y
`sendText`/el adaptador no oficial ya existentes en vez de duplicar lógica de envío.
Progreso en vivo vía el bus SSE ya usado por la bandeja y el Laboratorio.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict + noUncheckedIndexedAccess), React 19

**Primary Dependencies**: Next.js 15 App Router, Drizzle ORM, Zod — todas ya en el
proyecto. Sin dependencias nuevas: el parseo de CSV se implementa a mano (formato
simple, separador coma, sin necesidad de una librería).

**Storage**: PostgreSQL vía Drizzle. Dos tablas nuevas: `campaign` y
`campaign_recipient` (migración nueva vía `pnpm db:generate`).

**Testing**: Vitest (unit, para el parser de CSV y el render de variables) + self-test
E2E en vivo (Principio IX) con Playwright real contra `pnpm dev` + mocks.

**Target Platform**: Web (navegador) + Node self-hosted.

**Project Type**: Monolito Next.js existente.

**Performance Goals**: N/A — disparo secuencial deliberado (uno por uno, con
intervalo), no es una ruta de alto throughput.

**Constraints**: El intervalo entre envíos del modo no oficial MUST ser configurable
(Principio IX v2.0.0) — nunca una constante en código. El envío ocurre in-process
(Constitución II) — nada de colas/workers externos.

**Scale/Scope**: pensado para decenas/cientos de destinatarios por campaña (uso de
una agencia/negocio chico), no miles — coherente con el Principio VIII (foco
vertical, no es plataforma de marketing masivo a escala).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Seguridad de Datos**: sin secretos nuevos; reutiliza credenciales ya cifradas
  (Meta / canal no oficial) tal como están. PASS.
- **II. Soberanía (v2.0.0)**: canal no oficial ya permitido; disparo in-process, sin
  colas externas. PASS.
- **III. Multi-tenancy**: `campaign`/`campaign_recipient` llevan `organization_id`
  NOT NULL, todas las queries vía `scoped()`. PASS.
- **IV. Idempotencia**: cada destinatario crea/reutiliza contacto+conversación con
  los mismos helpers idempotentes ya probados (`getOrCreateContact`/
  `getOrCreateConversation`); doble-disparo bloqueado por el estado de la campaña
  (FR-011). PASS.
- **V. Calidad Verificable**: gate típecheck+lint+build+test sin excepción. PASS
  (pendiente de ejecutar).
- **VI. Specs Antes de Código**: este plan y spec preceden la implementación. PASS.
- **VII. Trazabilidad**: alcance recortado (sin agendamiento, sin selección desde
  pipeline/tags) documentado en spec.md → Assumptions. PASS.
- **VIII. Foco Vertical (v2.0.0)**: campañas ya admitidas explícitamente como
  extensión de "convertir conversaciones a escala"; no es un builder de flujos
  genérico ni scraping. PASS.
- **IX. Verificación en Vivo (v2.0.0)**: MUST advertir riesgo de ban en la UI antes
  de guardar una campaña no oficial (FR-005) y el intervalo MUST ser configurable
  (FR-006) — ambos ya reflejados en los requisitos. Self-test E2E en vivo cubriendo
  ambos canales antes de declarar "Hecho". Pendiente de ejecutar en implementación.

Sin violaciones — no aplica Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/004-campanhas-disparo-massa/
├── plan.md              # This file
├── spec.md              # Feature spec
├── data-model.md         # Phase 1 output
├── tasks.md              # Phase 2 output (/speckit-tasks)
└── checklists/
    └── requirements.md
```

Sin `research.md`: no hay incógnitas técnicas — el patrón de trabajo en segundo
plano in-process, el bus SSE y los primitivos de envío ya existen y se documentan
en Technical Context. Sin `contracts/` separado: los endpoints se documentan en
`data-model.md` junto a las entidades que exponen, dado el tamaño acotado de la
feature.

### Source Code (repository root)

```text
src/
├── lib/
│   ├── db/schema.ts              # + tablas campaign, campaignRecipient
│   └── campaigns/
│       ├── render.ts             # renderMessage/extractVariables (texto libre)
│       └── csv.ts                # parseRecipientsCsv (teléfono + variables)
├── server/
│   └── campaigns/
│       ├── queries.ts            # list/get/serialize
│       ├── create.ts             # crear campaña + destinatarios desde CSV
│       └── send.ts               # runCampaign (bucle in-process) + cancelCampaign
├── app/api/campaigns/
│   ├── route.ts                  # GET (listar) / POST (crear)
│   ├── import-csv/route.ts       # POST → preview de un CSV (sin persistir)
│   └── [id]/
│       ├── route.ts              # GET (detalle + destinatarios)
│       ├── send/route.ts         # POST (dispara, dispara el loop en segundo plano)
│       └── cancel/route.ts       # POST (cancela)
├── app/(app)/campanhas/
│   ├── page.tsx
│   └── [id]/page.tsx
└── components/campaigns/
    ├── campaigns-client.tsx      # listado + modal de creación
    └── campaign-detail-client.tsx # detalle con progreso en vivo (SSE)
```

**Structure Decision**: sigue el mismo patrón que `inbox`/`whatsapp`/`unofficial` ya
establecido en el repo (`src/lib/<dominio>/` para lógica pura, `src/server/<dominio>/`
para acceso a datos y orquestación, `src/app/api/<dominio>/` para las rutas,
`src/components/<dominio>/` para la UI). Cero desvíos de la convención existente.

## Complexity Tracking

*(vacío — no hay violaciones que justificar)*
