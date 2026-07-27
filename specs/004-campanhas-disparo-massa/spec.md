# Feature Specification: Campañas de disparo en masa

**Feature Branch**: `004-campanhas-disparo-massa`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "Sprint 2 del roadmap de Vocero: campañas de disparo en masa, en dos modos — oficial (Meta API con templates aprobados, sin riesgo de ban) y no oficial (canal Baileys/Evolution con texto libre, riesgo de ban asumido). Lista de destinatarios vía CSV. Intervalo entre envíos configurable. Habilitado por la enmienda de constitución v2.0.0 (Principios II, VIII, IX)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Disparar una campaña oficial con una plantilla aprobada (Priority: P1)

Como operador, quiero crear una campaña que envíe una plantilla ya aprobada por Meta
a una lista de contactos que subo por CSV, para reactivar leads fríos sin arriesgar
el número (canal oficial, sin ban posible).

**Why this priority**: Es el modo sin riesgo — el que cualquier operador puede usar
de entrada, y el que valida el flujo completo (CSV → destinatarios → disparo →
métricas) antes de habilitar el modo de riesgo.

**Independent Test**: Con al menos una plantilla aprobada, crear una campaña oficial,
subir un CSV de 2-3 teléfonos, dispararla, y verificar que cada destinatario recibe
un mensaje tipo plantilla (visible en su conversación) y que el contador de
enviados/fallidos de la campaña se actualiza en vivo.

**Acceptance Scenarios**:

1. **Given** al menos una plantilla aprobada existe, **When** el operador crea una
   campaña eligiendo canal "Oficial" y esa plantilla, **Then** el formulario exige
   un CSV con teléfono en la primera columna y, si la plantilla tiene {{1}}, una
   columna para su valor.
2. **Given** un CSV subido, **When** el operador lo confirma, **Then** se muestra
   una previsualización con el total de destinatarios detectados y las primeras
   filas.
3. **Given** una campaña oficial en borrador con destinatarios cargados, **When** el
   operador la dispara, **Then** el sistema crea (o reutiliza) el contacto y la
   conversación de cada destinatario y envía la plantilla vía el canal oficial,
   uno por uno.
4. **Given** una campaña disparándose, **When** el operador abre su detalle, **Then**
   ve en vivo cuántos se enviaron, cuántos fallaron y cuántos quedan, sin recargar
   la página.
5. **Given** una plantilla no aprobada (pendiente o rechazada), **When** el operador
   intenta crear una campaña oficial con ella, **Then** el sistema lo impide con un
   mensaje claro.

---

### User Story 2 - Disparar una campaña no oficial con texto libre y variables (Priority: P2)

Como operador con el canal no oficial conectado, quiero enviar un mensaje de texto
libre con variables propias ({{nombre}}, {{empresa}}...) a una lista de contactos,
para campañas más personalizadas cuando acepto el riesgo de baneo de ese número.

**Why this priority**: Requiere el canal no oficial ya conectado (Principio II v2)
y es el modo de mayor riesgo — depende de que el modo oficial (US1) ya pruebe el
flujo base de CSV/disparo/métricas.

**Independent Test**: Con el canal no oficial conectado, crear una campaña no
oficial con un mensaje que use una variable nombrada, un intervalo de envío
configurado, subir un CSV con esa columna, confirmar el aviso de riesgo de baneo,
dispararla, y verificar que cada mensaje sale con la variable ya sustituida por el
valor de esa fila y que el envío respeta el intervalo configurado (no en ráfaga).

**Acceptance Scenarios**:

1. **Given** el operador elige canal "No oficial" al crear la campaña, **When** eso
   ocurre, **Then** el sistema MUST mostrar una advertencia explícita de riesgo de
   baneo que el operador debe confirmar antes de continuar.
2. **Given** una campaña no oficial, **When** el operador escribe el mensaje con
   `{{variable}}` nombradas, **Then** el sistema detecta automáticamente los
   nombres de variable usados y los usa para mapear las columnas del CSV (además
   de la primera columna, que siempre es el teléfono).
3. **Given** una campaña no oficial en borrador, **When** el operador configura el
   intervalo entre envíos, **Then** ese valor MUST ser editable por el operador (no
   hay un valor fijo no configurable) y se usa realmente entre cada envío.
4. **Given** una campaña no oficial disparándose, **When** eso ocurre, **Then** cada
   mensaje sale con las variables de esa fila ya sustituidas en el texto.
5. **Given** el canal no oficial no está conectado, **When** el operador intenta
   crear una campaña no oficial, **Then** el sistema lo impide con un mensaje claro
   indicando que debe conectar el canal primero.

---

### User Story 3 - Seguir y cancelar una campaña en curso (Priority: P3)

Como operador, quiero ver el historial de campañas con sus métricas y poder
cancelar una que está en curso, para tener control si algo sale mal a mitad de
camino (números equivocados, plantilla incorrecta, etc.).

**Why this priority**: Es control/observabilidad sobre lo que ya construyen US1 y
US2 — valioso pero no bloquea demostrar el disparo en sí.

**Independent Test**: Disparar una campaña con varios destinatarios, cancelarla a
mitad de camino, y verificar que deja de enviar mensajes nuevos y su estado queda
"cancelada" con el conteo de lo ya enviado hasta ese punto (no se pierde lo hecho).

**Acceptance Scenarios**:

1. **Given** la lista de campañas de la organización, **When** el operador la abre,
   **Then** ve nombre, canal, estado y métricas (total/enviados/fallidos) de cada
   una, más recientes primero.
2. **Given** una campaña con estado "enviando", **When** el operador la cancela,
   **Then** deja de procesar destinatarios pendientes (los ya enviados no se
   revierten) y su estado pasa a "cancelada".
3. **Given** una campaña ya terminada (enviada o cancelada), **When** el operador la
   abre, **Then** no hay acción de "disparar" ni "cancelar" disponible — solo el
   detalle final.

### Edge Cases

- CSV sin la columna de teléfono o con teléfonos mal formados: esas filas se
  reportan como inválidas en la previsualización, no bloquean las filas válidas.
- Un teléfono del CSV coincide con un contacto que ya existe: se reutiliza el
  contacto y su conversación (idempotente), no se duplica.
- Falla el envío a un destinatario puntual (Meta o gateway no disponible): la
  campaña continúa con el resto; ese destinatario queda marcado como fallido con el
  motivo.
- El operador cierra la pestaña mientras la campaña se envía: el envío sigue en el
  servidor (no depende del navegador abierto); al volver a abrir el detalle, ve el
  progreso real.
- Doble clic en "Disparar": una campaña ya en estado "enviando" no puede volver a
  dispararse.
- Campaña oficial cuya plantilla es rechazada o desconectada DESPUÉS de crearla
  pero ANTES de dispararla: el disparo lo detecta y lo rechaza con mensaje claro,
  no falla en silencio destinatario por destinatario.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir crear una campaña eligiendo un canal
  ("oficial" o "no oficial"), sujeto a que ese canal esté disponible en la
  organización (plantilla aprobada para oficial; canal no oficial conectado para
  no oficial).
- **FR-002**: Una campaña oficial MUST asociarse a una plantilla aprobada
  existente; si esa plantilla usa {{1}}, la campaña MUST exigir de dónde sale el
  valor de esa variable por destinatario.
- **FR-003**: Una campaña no oficial MUST tener un cuerpo de mensaje de texto libre
  que puede incluir variables nombradas `{{como_esta}}`; el sistema MUST detectar
  automáticamente esos nombres.
- **FR-004**: El sistema MUST aceptar un CSV donde la primera columna es el
  teléfono y las demás son variables por nombre de columna, y MUST mostrar una
  previsualización (total de filas válidas/inválidas, primeras filas) antes de
  confirmar.
- **FR-005**: Crear una campaña no oficial MUST requerir que el operador confirme
  explícitamente un aviso de riesgo de baneo antes de poder guardarla.
- **FR-006**: El intervalo entre envíos de una campaña no oficial MUST ser un
  campo editable por el operador (nunca un valor fijo en el código), con un valor
  por defecto razonable.
- **FR-007**: Disparar una campaña MUST procesar sus destinatarios uno por uno,
  creando o reutilizando el contacto y la conversación de cada uno de forma
  idempotente (mismo comportamiento que el resto del CRM).
- **FR-008**: Un fallo de envío a un destinatario MUST registrarse en ese
  destinatario (con motivo) y MUST NOT detener el envío al resto.
- **FR-009**: El sistema MUST exponer el progreso de una campaña en curso
  (enviados/fallidos/pendientes) en vivo, sin que el operador tenga que recargar
  la página.
- **FR-010**: El operador MUST poder cancelar una campaña en estado "enviando"; al
  cancelarla, deja de procesar destinatarios pendientes sin revertir lo ya enviado.
- **FR-011**: Una campaña ya en estado "enviando" MUST NOT poder dispararse de
  nuevo (ni por doble clic ni por otra acción).
- **FR-012**: El sistema MUST rechazar el disparo de una campaña oficial si su
  plantilla ya no está aprobada al momento de disparar (fue rechazada o
  eliminada), y de una campaña no oficial si el canal ya no está conectado.
- **FR-013**: El sistema MUST listar las campañas de la organización con su canal,
  estado y métricas, ordenadas por fecha de creación descendente.

### Key Entities

- **Campaña**: nombre, canal (oficial/no oficial), referencia a la plantilla
  (oficial) o cuerpo de mensaje con variables (no oficial), intervalo entre envíos,
  estado (borrador/enviando/enviada/cancelada), contadores (total/enviados/fallidos),
  pertenece a una organización.
- **Destinatario de campaña**: teléfono, variables nombradas de esa fila (JSON),
  contacto asociado (una vez creado/reutilizado), estado individual
  (pendiente/enviado/fallido), motivo de fallo si aplica, pertenece a una campaña.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un operador puede crear y disparar una campaña oficial completa
  (elegir plantilla, subir CSV, confirmar, disparar) en menos de 2 minutos para una
  lista de hasta 10 destinatarios.
- **SC-002**: El 100% de los destinatarios de una campaña — exitosos o fallidos —
  quedan reflejados en las métricas de esa campaña; ninguno se "pierde" en el
  proceso.
- **SC-003**: Cancelar una campaña en curso detiene nuevos envíos en menos de un
  intervalo de espera configurado (nunca sigue disparando después de cancelada).
- **SC-004**: Cero mensajes en ráfaga por el canal no oficial: el tiempo entre dos
  envíos consecutivos de una misma campaña nunca es menor al intervalo configurado.

## Assumptions

- **Sin agendamiento en esta iteración**: el roadmap original menciona "agendar o
  disparar agora"; esta iteración solo implementa disparo inmediato. Agendar para
  una fecha/hora futura requeriría un mecanismo de reintento tras reinicio del
  proceso (persistencia del scheduler) que no está resuelto en el proyecto todavía
  — se documenta como alcance futuro explícito, no se improvisa a medias.
- **Destinatarios solo por CSV en esta iteración**: el roadmap también menciona
  seleccionar contactos del CRM filtrando por etapa/tag. Se deja fuera de esta
  iteración por alcance — el CSV ya cubre el caso de uso principal (lista externa)
  y evita construir un selector de filtros de pipeline/tags a mitad de camino.
  Puede agregarse después reutilizando el mismo modelo de "destinatario de
  campaña".
- **Variable única {{1}} en campañas oficiales**: el modelo de plantillas de este
  proyecto ya limita las plantillas a máximo una variable {{1}} (acotamiento v1,
  `validateBodyVariables`); las campañas oficiales heredan esa misma limitación,
  no la amplían.
- **Envío en el propio proceso Node** (Constitución II: sin colas externas), igual
  que el turno del agente y el runner del Laboratorio ya funcionan: el disparo se
  ejecuta en segundo plano dentro del mismo proceso que sirve la app, no en un
  worker externo.
- **Progreso en vivo vía el mismo bus de eventos SSE** que ya usa la bandeja y el
  Laboratorio (`campaign.run`), no una tecnología nueva.
