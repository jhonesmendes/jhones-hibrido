# Feature Specification: Atajo de plantillas y alta manual de contacto

**Feature Branch**: `003-sprint1-templates-contacts`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "Sprint 1 del roadmap de Vocero (frontend puro, zero riesgo, solo canal ya existente). Historia A: atajo '/' para insertar plantillas en el composer de la bandeja, con la primera variable numerada pre-seleccionada y editable, unificando el comportamiento con los chips de acceso rápido ya existentes. Historia B: completar el alta manual de contacto vía 'iniciar conversa' por teléfono, terminando el trabajo ya empezado (sin commitear) en el repo."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Insertar una plantilla aprobada escribiendo "/" (Priority: P1)

Como operador que atiende conversaciones de WhatsApp, quiero escribir "/" en el campo
de respuesta y elegir una plantilla aprobada de una lista, para no tener que recordar
o volver a escribir mensajes que ya uso seguido — y poder corregir rápido la parte
personalizada (nombre, número de pedido, etc.) antes de enviar.

**Why this priority**: Es el pedido explícito del dueño del producto para este sprint;
reduce fricción en la respuesta diaria sin tocar nada del envío ya construido.

**Independent Test**: Con al menos una plantilla aprobada en la organización, abrir una
conversación, escribir "/" en el campo de respuesta y verificar que aparece la lista de
plantillas; seleccionar una y verificar que el cuerpo aparece en el campo con la primera
variable resaltada; escribir sobre ella y enviar — el mensaje sale como un mensaje normal
por el canal correcto de la conversación.

**Acceptance Scenarios**:

1. **Given** el campo de respuesta vacío, **When** el operador escribe "/", **Then** se
   muestra un desplegable con las plantillas aprobadas de la organización.
2. **Given** el desplegable abierto, **When** el operador sigue escribiendo después de
   "/" (p. ej. "/promo"), **Then** la lista se filtra a las plantillas cuyo nombre
   contiene ese texto.
3. **Given** el desplegable abierto con resultados, **When** el operador selecciona una
   plantilla (con el mouse o con teclado), **Then** el campo de respuesta se llena con
   el cuerpo de la plantilla y, si el cuerpo tiene una variable ({{1}}, {{2}}...), esa
   variable queda resaltada/seleccionada de forma que escribir encima la reemplaza.
4. **Given** una plantilla insertada con su variable seleccionada, **When** el operador
   no toca nada y solo envía, **Then** el mensaje se envía con el texto de la plantilla
   tal cual (incluyendo el marcador de variable sin reemplazar) — no se bloquea el envío.
5. **Given** el desplegable abierto, **When** el operador presiona Escape, **Then** el
   desplegable se cierra y el texto escrito hasta ese momento permanece en el campo.
6. **Given** el desplegable abierto sin ninguna coincidencia, **When** eso ocurre,
   **Then** se muestra un estado vacío indicando que no hay plantillas con ese nombre.
7. **Given** el operador hace clic en una de las plantillas de acceso rápido (chips) que
   ya existen sobre el campo de respuesta, **When** eso ocurre, **Then** el
   comportamiento de inserción y selección de variable es el mismo que el del atajo "/"
   (deja de sustituir la variable en silencio por el nombre del contacto).

---

### User Story 2 - Iniciar una conversación (y dar de alta el contacto) escribiendo un teléfono (Priority: P2)

Como operador, quiero poder escribir el número de teléfono de una persona que todavía
no me escribió y abrir/crear su conversación desde ahí, para poder registrar y contactar
manualmente a alguien sin esperar a que esa persona escriba primero.

**Why this priority**: Completa un trabajo ya empezado en el repo (sin commitear); es
menor alcance que la Historia 1 y no bloquea nada de lo demás.

**Independent Test**: En el buscador de la lista de conversaciones, escribir un número
de teléfono que no tenga conversación previa, ver la opción "Iniciar conversa", tocarla,
y verificar que se abre una conversación nueva con ese contacto (visible en la lista y
seleccionada), sin recargar la página.

**Acceptance Scenarios**:

1. **Given** el buscador de la lista de conversaciones vacío de resultados por nombre,
   **When** el operador escribe una secuencia que parece un teléfono, **Then** aparece
   una opción para iniciar conversa con ese número.
2. **Given** la opción "Iniciar conversa" visible, **When** el operador la selecciona,
   **Then** el contacto se crea (si no existía) o se reutiliza (si ya existía), se
   crea o reutiliza su conversación, la lista de conversaciones se actualiza, y la
   conversación queda abierta/seleccionada.
3. **Given** un teléfono que ya tiene contacto y conversación existentes, **When** el
   operador usa "Iniciar conversa" con ese mismo número, **Then** se abre la conversación
   existente en vez de crear un duplicado.
4. **Given** un fallo de red o del servidor al iniciar la conversación, **When** eso
   ocurre, **Then** la interfaz no queda colgada — el botón vuelve a su estado normal y
   el operador puede reintentar.

### Edge Cases

- Organización sin ninguna plantilla aprobada: el atajo "/" debe mostrar un estado vacío
  claro en vez de una lista vacía sin explicación.
- Plantilla con más de una variable ({{1}} y {{2}}): solo la primera variable queda
  pre-seleccionada; las siguientes quedan como texto normal editable a mano.
- El operador escribe "/" en medio de un texto que ya venía escribiendo (no como primer
  carácter): no se interpreta como atajo — evita romper mensajes que legítimamente
  contienen una barra.
- Teléfono escrito en el buscador con formato libre (espacios, guiones): se normaliza
  antes de usarse, igual que ya hace el resto del producto.
- Doble clic / doble Enter en "Iniciar conversa": no debe crear dos conversaciones para
  el mismo número (idempotente, igual que la ingesta de mensajes entrantes).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El campo de respuesta MUST detectar cuando el operador escribe "/" como
  primer carácter y mostrar un desplegable de plantillas aprobadas de la organización.
- **FR-002**: El desplegable MUST filtrarse en vivo por el texto escrito después de "/",
  contra el nombre de la plantilla.
- **FR-003**: Seleccionar una plantilla (mouse o teclado) MUST insertar su cuerpo en el
  campo de respuesta.
- **FR-004**: Si el cuerpo insertado contiene una variable numerada, esa variable MUST
  quedar seleccionada como texto editable inmediatamente después de insertarse.
- **FR-005**: El envío del mensaje resultante MUST usar el mismo camino de envío que
  cualquier mensaje de texto libre (sin requisitos nuevos de canal u endpoint).
- **FR-006**: Las plantillas de acceso rápido (chips) existentes MUST comportarse igual
  que el atajo "/" al insertarse (variable seleccionada y editable, no sustituida en
  silencio).
- **FR-007**: El desplegable MUST cerrarse con Escape sin perder el texto ya escrito.
- **FR-008**: El buscador de la lista de conversaciones MUST reconocer una entrada que
  parece un número de teléfono y ofrecer la opción de iniciar una conversa con él.
- **FR-009**: Confirmar "Iniciar conversa" MUST crear el contacto si no existe, o
  reutilizarlo si ya existe (por organización + teléfono), de forma idempotente.
- **FR-010**: Confirmar "Iniciar conversa" MUST crear la conversación si no existe, o
  reutilizarla si ya existe, y dejarla seleccionada en la interfaz sin recargar la página.
- **FR-011**: Un fallo al iniciar la conversa MUST dejar la interfaz en un estado
  reintentable (no bloqueada).

### Key Entities

- **Plantilla (existente)**: nombre, idioma, categoría, cuerpo con variables numeradas,
  estado de aprobación. No se agregan campos nuevos.
- **Contacto (existente)**: teléfono, nombre. Se reutiliza tal cual.
- **Conversación (existente)**: vínculo con un contacto, canal activo. Se reutiliza tal
  cual — esta feature no introduce ni modifica canales.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un operador puede insertar una plantilla en el campo de respuesta en menos
  de 3 acciones (escribir "/", escribir opcionalmente para filtrar, seleccionar).
- **SC-002**: El 100% de las plantillas insertadas (por "/" o por chip) dejan la primera
  variable en estado editable/seleccionado, sin excepciones entre ambas vías de acceso.
- **SC-003**: Un operador puede iniciar una conversación nueva a partir de un teléfono
  escrito a mano en menos de 10 segundos, sin recargar la página.
- **SC-004**: Cero conversaciones o contactos duplicados generados por usos repetidos de
  "Iniciar conversa" sobre el mismo número.

## Assumptions

- **Alcance de "alta manual de contacto"**: el roadmap original menciona "cadastro
  manual de contatos" sin especificar una pantalla dedicada. Se asume que completar el
  flujo "Iniciar conversa" por teléfono (ya empezado en el repo, en
  `conversation-list.tsx` / `route.ts` / `utils.ts`) satisface esta necesidad, en lugar
  de construir un formulario separado de "nuevo contacto" en la sección Contactos —
  porque en este producto un contacto existe para conversar por WhatsApp, y es el
  patrón que ya está a medio construir en el árbol. Un formulario dedicado en
  Contactos queda fuera de alcance de este sprint; se puede reconsiderar si el dueño lo
  pide explícitamente más adelante.
- **Plantillas y canal no oficial**: la selección de plantilla solo inserta texto en el
  campo de respuesta; el envío subsiguiente ya decide el canal (oficial/no oficial) por
  la conversación, sin cambios en esta feature. El concepto de "plantilla aprobada por
  Meta" sigue siendo exclusivo del canal oficial, pero nada impide usarla como texto
  base también en una conversación por canal no oficial.
- Esta feature no toca Fase 2 (motor no oficial) ni Fase 3 (medias en bandeja) del
  roadmap: ambas ya están implementadas en el código actual.
