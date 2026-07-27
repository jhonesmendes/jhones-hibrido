---

description: "Task list for Sprint 1: atajo de plantillas + alta manual de contacto"
---

# Tasks: Atajo de plantillas y alta manual de contacto

**Input**: Design documents from `specs/003-sprint1-templates-contacts/`

**Prerequisites**: plan.md, spec.md

**Tests**: No se piden tests unitarios nuevos (la spec no los exige); la verificación es
el self-test E2E en vivo del Principio IX, ejecutado por el implementador.

**Organization**: Tareas agrupadas por historia de usuario.

## Phase 1: Setup

- [X] T001 Confirmar que el entorno instala y compila antes de tocar código
  (`corepack pnpm install`, reparar cualquier corrupción de `node_modules`)

---

## Phase 2: User Story 1 - Atajo "/" para plantillas (Priority: P1) 🎯 MVP

**Goal**: Escribir "/" en el composer abre un desplegable de plantillas aprobadas;
seleccionar una inserta el cuerpo con la primera variable numerada seleccionada/editable.
Los chips de acceso rápido existentes pasan a comportarse igual.

**Independent Test**: Ver spec.md § User Story 1 → Independent Test.

### Implementation for User Story 1

- [X] T010 [US1] En `src/components/inbox/composer.tsx`: extraer una función
  `applyTemplate(t: TemplateDto)` que (a) hace `setText(t.body)`, (b) tras el próximo
  render, enfoca el textarea y selecciona el rango de la primera variable numerada
  (`/\{\{\s*\d+\s*\}\}/`) con `setSelectionRange`, o coloca el cursor al final si no hay
  variable, (c) ejecuta `autogrow()`.
- [X] T011 [US1] Cambiar el `onClick` de las chips de acceso rápido existentes para usar
  `applyTemplate(t)` en vez de sustituir `{{1}}` por el nombre del contacto en silencio.
- [X] T012 [US1] Agregar estado local para el desplegable: detectar cuando `text`
  coincide con `/^\/(\S*)$/` (barra como primer carácter, sin espacios todavía) y derivar
  la lista filtrada de `templates` (ya cargadas) por `name` (contains, case-insensitive).
- [X] T013 [US1] Renderizar el desplegable (reutilizando estilo visual de las chips /
  `TemplateSender`) sobre el textarea cuando hay coincidencia de "/": lista de resultados
  con nombre + categoría + preview corto del cuerpo; estado vacío ("Nenhum modelo
  encontrado") cuando el filtro no matchea ninguna.
- [X] T014 [US1] Navegación de teclado dentro del desplegable: ArrowUp/ArrowDown mueven
  un índice resaltado; Enter con el desplegable abierto selecciona el resaltado (en vez
  de enviar el mensaje); Escape cierra el desplegable sin borrar el texto.
- [X] T015 [US1] Clic en un ítem del desplegable también dispara `applyTemplate(t)` y
  cierra el desplegable.
- [X] T016 [US1] Confirmar que cuando `templates` está vacío (organización sin plantillas
  aprobadas) escribir "/" muestra un estado vacío explicativo, no un desplegable vacío.

**Checkpoint**: US1 funcional y probada en vivo de forma independiente.

---

## Phase 3: User Story 2 - Completar alta manual de contacto (Priority: P2)

**Goal**: Terminar el WIP existente para que escribir un teléfono en el buscador de la
bandeja permita iniciar/abrir su conversación.

**Independent Test**: Ver spec.md § User Story 2 → Independent Test.

### Implementation for User Story 2

- [X] T020 [US2] En `src/components/inbox/inbox-client.tsx`: implementar
  `startConversation(phone: string): Promise<boolean>` con `useCallback` — `POST
  /api/conversations` con `{ phone }`, en caso de éxito `await refetchConversations()`,
  `select(conversation.id)` y devuelve `true`; en caso de fallo devuelve `false` (no
  lanza) para que `ConversationList` sepa si debe conservar el texto de búsqueda.
- [X] T021 [US2] Pasar `onStartConversation={startConversation}` a `<ConversationList
  .../>` en `inbox-client.tsx` (hoy falta y rompe el build).
- [X] T022 [US2] Verificar que `POST /api/conversations` (ya en el árbol, sin commitear)
  compila y respeta el schema Zod (`contactId` XOR `phone`+`name` opcional) — no requiere
  cambios si el WIP ya está correcto, solo confirmarlo con el gate técnico.
- [X] T023 [US2] (encontrado durante el self-test E2E, no estaba en el plan original) El
  botón «Iniciar conversa» ya existía computado (`startButton`) en
  `conversation-list.tsx` pero nunca se renderizaba — agregado al árbol. Además, un fallo
  de red limpiaba igual el texto de búsqueda (perdiendo la posibilidad de reintentar,
  violando FR-011): se cambió el contrato de `onStartConversation` para devolver
  `boolean` y solo limpiar la búsqueda en éxito.

**Checkpoint**: US2 funcional y probada en vivo de forma independiente; build ya no
falla por el prop faltante.

---

## Phase 4: Polish

- [X] T030 [P] Gate técnico completo: `pnpm typecheck && pnpm lint && pnpm build && pnpm test`
- [X] T031 Self-test E2E en vivo (Principio IX) de ambas historias contra `pnpm dev` +
  Postgres local + mocks (`WA_MOCK_ENABLED=true`), agente de IA desactivado a propósito
  (fuera de alcance de este sprint). Cubre camino feliz e infeliz (sin plantillas
  aprobadas, fallo de red en «Iniciar conversa»). 18/18 aserciones en verde.

## Dependencies & Execution Order

- Setup (T001) bloquea todo lo demás.
- US1 (T010-T016) y US2 (T020-T022) son independientes entre sí — sin dependencias
  cruzadas de archivos (US1 toca `composer.tsx`; US2 toca `inbox-client.tsx`).
- T011 depende de T010 (reusa `applyTemplate`).
- T013-T015 dependen de T012 (estado del desplegable).
- Polish (T030-T031) depende de que ambas historias estén implementadas.

## Notes

- Sin tareas de tests automatizados nuevas: la spec no los pide y el patrón de
  verificación de este proyecto es el self-test E2E en vivo (Principio IX), no
  cobertura unitaria por historia.
- Cero tareas de creación de archivos nuevos de producto — todo el trabajo es edición de
  archivos existentes.
