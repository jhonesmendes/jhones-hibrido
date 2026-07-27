# Implementation Plan: Atajo de plantillas y alta manual de contacto

**Branch**: `003-sprint1-templates-contacts` | **Date**: 2026-07-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-sprint1-templates-contacts/spec.md`

## Summary

Dos historias de UI puras sobre el composer de la bandeja y la lista de conversaciones,
sin nuevos endpoints, tablas ni cambios de canal:

- **US1**: atajo "/" en el composer que abre un desplegable de plantillas aprobadas
  (reutiliza `GET /api/templates`, ya existe), inserta el cuerpo y deja la primera
  variable numerada seleccionada/editable. Se unifica con las chips de acceso rápido
  existentes (mismo comportamiento de inserción).
- **US2**: terminar la integración ya empezada (sin commitear) de "iniciar conversa"
  por teléfono — conectar `onStartConversation` en `inbox-client.tsx` con el
  `POST /api/conversations` que ya existe en el árbol.

No se agregan dependencias, tablas ni rutas nuevas.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict + noUncheckedIndexedAccess), React 19

**Primary Dependencies**: Next.js 15 App Router, Tailwind, lucide-react — todas ya en el proyecto

**Storage**: PostgreSQL vía Drizzle — sin cambios de schema en este sprint

**Testing**: Vitest (unit, si aplica) + guion E2E Playwright con mocks (`tests/e2e/`)

**Target Platform**: Web (navegador), self-hosted

**Project Type**: Monolito Next.js — frontend + API routes en el mismo proyecto

**Performance Goals**: N/A (interacción de UI local, sin llamadas nuevas de red además de las ya existentes)

**Constraints**: No modificar el envío de mensajes ni el ruteo por canal; reusar `sendText`/`sendTemplate` tal cual existen

**Scale/Scope**: 2 componentes de UI existentes modificados (`composer.tsx`, `conversation-list.tsx` + `inbox-client.tsx`); 0 endpoints nuevos (el `POST /api/conversations` ya existe sin commitear)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Seguridad de Datos**: sin cambios de secretos/credenciales. PASS.
- **II. Soberanía**: no se agrega dependencia externa ni se toca el canal no oficial. PASS.
- **III. Multi-tenancy**: `POST /api/conversations` ya scoped por `session.organizationId`
  (usa `scoped()` y los helpers `getOrCreateContact`/`getOrCreateConversation`, que ya
  reciben `organizationId`). PASS.
- **IV. Idempotencia**: `getOrCreateContact`/`getOrCreateConversation` ya usan
  `onConflictDoNothing` sobre índices únicos existentes (`contact_org_phone_uq`,
  `conversation_org_contact_real_uq`) — reintentos/doble clic no duplican. PASS.
- **V. Calidad Verificable**: gate típecheck+lint+build+test aplica sin excepción. PASS
  (pendiente de ejecutar).
- **VI. Specs Antes de Código**: este plan y su spec preceden a la implementación. PASS.
- **VII. Trazabilidad**: la interpretación de "alta manual de contacto" (sin formulario
  dedicado en Contactos) queda documentada en `spec.md` → Assumptions. PASS.
- **VIII. Foco Vertical**: ambas historias sirven directamente a atender/organizar
  conversaciones de WhatsApp de un negocio; no es broadcast ni scraping. PASS.
- **IX. Verificación en Vivo**: self-test E2E obligatorio antes de declarar "Hecho" —
  ejercer el atajo "/" y "Iniciar conversa" en el navegador (Playwright + mocks),
  incluyendo camino infeliz (sin plantillas aprobadas; fallo de red en "Iniciar
  conversa"). Pendiente de ejecutar en Fase de implementación.

Sin violaciones — no aplica Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-sprint1-templates-contacts/
├── plan.md              # This file
├── spec.md              # Feature spec
├── tasks.md             # Phase 2 output (/speckit-tasks)
└── checklists/
    └── requirements.md
```

No se generan `research.md` / `data-model.md` / `contracts/`: no hay incógnitas
técnicas que investigar (stack y patrones ya establecidos en el repo), no hay
entidades nuevas, y no hay contratos de API nuevos — ambas historias reutilizan
endpoints y tablas existentes tal cual.

### Source Code (repository root)

```text
src/
├── components/
│   └── inbox/
│       ├── composer.tsx           # US1: atajo "/" + unificar chips
│       ├── conversation-list.tsx  # US2: ya tiene el WIP de "Iniciar conversa"
│       └── inbox-client.tsx       # US2: conectar onStartConversation
├── app/api/conversations/
│   └── route.ts                   # US2: POST ya existe (WIP sin commitear)
└── lib/
    └── utils.ts                   # US2: normalizePhoneInput ya existe (WIP)
```

**Structure Decision**: Monolito existente, sin nuevos directorios. Todos los cambios
caen dentro de `src/components/inbox/` (US1 y la mitad de US2) y un cableado puntual en
`inbox-client.tsx` (el resto de US2). Cero archivos nuevos de código de producto.

## Complexity Tracking

*(vacío — no hay violaciones que justificar)*
