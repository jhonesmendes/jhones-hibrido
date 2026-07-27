# Feature Specification: Follow-up automático de pipeline

**Feature Branch**: `005-followup-automatico-pipeline`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "Sprint 3 del roadmap de Vocero: follow-up automático de pipeline — recordatorio configurable cuando un lead queda detenido en una etapa gatillo, detección de documento que mueve automáticamente a una etapa de éxito, y expiración automática sin respuesta. Nada de negocio fijo en el código: nombres de etapa, intervalo, mensaje y umbral de expiración salen del banco. NOTA de alcance: la Fase 2 original del roadmap (motor Baileys/Evolution + pantalla de QR) ya está implementada en el código bajo otro diseño (canal no oficial vía Evolution/WPPConnect/WAHA) — este sprint cubre solo lo que faltaba: follow-up + detección de documento."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configurar el follow-up automático de una etapa (Priority: P1)

Como operador, quiero configurar que una etapa de mi pipeline dispare un mensaje de
seguimiento automático cuando un lead queda detenido ahí sin responder, eligiendo el
intervalo, el mensaje y a qué etapas se mueve según lo que pase después, para no
tener que acordarme de dar seguimiento manual a cada lead frío.

**Why this priority**: Sin esta configuración no existe nada que disparar — es la
base de todo el resto de la funcionalidad.

**Independent Test**: Abrir la configuración de follow-up del pipeline, habilitarlo,
elegir una etapa gatillo, un intervalo, un mensaje y las etapas de éxito/expiración,
guardar, y verificar que la configuración persiste al recargar.

**Acceptance Scenarios**:

1. **Given** el pipeline tiene al menos una etapa, **When** el operador abre la
   configuración de follow-up, **Then** puede habilitarlo y elegir: etapa gatillo,
   intervalo (número + unidad horas/días), mensaje de seguimiento, etapa de éxito,
   etapa de expiración, y si requiere recibir un documento para considerarse exitoso.
2. **Given** una configuración guardada, **When** el operador la vuelve a abrir,
   **Then** ve los mismos valores que guardó (no hay nada fijo en el código).
3. **Given** el follow-up está deshabilitado, **When** eso ocurre, **Then** el
   sistema no dispara ningún mensaje ni movimiento automático.
4. **Given** el operador no eligió una etapa gatillo o un mensaje, **When** intenta
   habilitar el follow-up, **Then** el sistema se lo impide con un mensaje claro.

---

### User Story 2 - Disparo automático del mensaje de seguimiento (Priority: P1)

Como negocio, quiero que el sistema envíe solo el mensaje de seguimiento configurado
a todo lead que quede detenido en la etapa gatillo más tiempo del intervalo
configurado, sin que un humano tenga que revisarlo uno por uno.

**Why this priority**: Es el comportamiento central de la feature — sin disparo
automático, la configuración de US1 no sirve de nada.

**Independent Test**: Con follow-up habilitado e intervalo corto configurado,
esperar (o simular el paso del tiempo) a que un lead en la etapa gatillo supere el
intervalo sin actividad nueva, y verificar que recibe el mensaje configurado
automáticamente y que el envío queda registrado.

**Acceptance Scenarios**:

1. **Given** un lead en la etapa gatillo cuya última actividad supera el intervalo
   configurado, **When** el sistema revisa (de forma periódica, en segundo plano),
   **Then** le envía el mensaje de seguimiento configurado por el canal de su
   conversación.
2. **Given** un lead que ya recibió su recordatorio y aún no pasó el intervalo de
   gracia, **When** el sistema vuelve a revisar, **Then** NO le reenvía el mensaje
   (un solo recordatorio por período de inactividad).
3. **Given** un lead que respondió (nueva actividad) después de recibir el
   recordatorio, **When** vuelve a quedar inactivo el intervalo completo de nuevo,
   **Then** puede recibir un nuevo recordatorio (no es un límite de por vida, es por
   período de inactividad).
4. **Given** un lead en cualquier otra etapa (no la gatillo), **When** el sistema
   revisa, **Then** nunca lo considera para follow-up.

---

### User Story 3 - Documento recibido mueve automáticamente a la etapa de éxito (Priority: P2)

Como negocio que exige un comprobante/documento antes de continuar, quiero que
llegar un documento de un lead en la etapa gatillo lo mueva automáticamente a la
etapa de éxito y cancele cualquier seguimiento pendiente, para no tener que mover
las tarjetas a mano.

**Why this priority**: Depende de que el follow-up (US1/US2) ya exista; es una
mejora sobre el flujo base, no el flujo en sí.

**Independent Test**: Con "requiere documento" habilitado, simular la llegada de un
documento/imagen de un contacto cuyo lead está en la etapa gatillo (con o sin
recordatorio ya enviado), y verificar que el lead se mueve a la etapa de éxito y que
ya no llega el recordatorio si estaba pendiente.

**Acceptance Scenarios**:

1. **Given** "requiere documento" está habilitado y un lead está en la etapa
   gatillo, **When** llega un documento o imagen de ese contacto, **Then** el lead
   se mueve automáticamente a la etapa de éxito.
2. **Given** ese lead tenía un recordatorio ya enviado esperando expiración,
   **When** se recibe el documento, **Then** ese seguimiento pendiente se cancela
   (no se lo mueve luego a expirado).
3. **Given** "requiere documento" está deshabilitado, **When** llega un documento,
   **Then** el sistema NO mueve nada automáticamente por ese motivo (el follow-up
   solo se resuelve por tiempo/expiración).
4. **Given** el documento llega de un lead que NO está en la etapa gatillo,
   **When** eso ocurre, **Then** no pasa nada (la detección de documento solo aplica
   a la etapa gatillo configurada).

---

### User Story 4 - Expiración automática sin respuesta (Priority: P3)

Como negocio, quiero que un lead que no respondió ni envió el documento requerido
tras recibir el recordatorio se mueva automáticamente a una etapa de "expirado" tras
un plazo adicional, para que mi pipeline no acumule leads fríos indefinidamente en
la etapa gatillo.

**Why this priority**: Es el cierre del ciclo — valioso pero el negocio puede seguir
operando (revisando manualmente) si esto tarda en llegar.

**Independent Test**: Con un lead que ya recibió su recordatorio, dejar pasar el
plazo de gracia sin actividad nueva ni documento, y verificar que se mueve
automáticamente a la etapa de expiración configurada.

**Acceptance Scenarios**:

1. **Given** un lead recibió su recordatorio y pasó el plazo de gracia sin nueva
   actividad, **When** el sistema revisa, **Then** lo mueve a la etapa de
   expiración configurada.
2. **Given** ese mismo lead tuvo actividad nueva (respondió) antes de vencer el
   plazo de gracia, **When** el sistema revisa, **Then** NO lo mueve a expirado.
3. **Given** no hay una etapa de expiración configurada, **When** el plazo de
   gracia vence, **Then** el sistema no mueve el lead a ningún lado (deja el
   recordatorio como "vencido sin acción" en vez de fallar).

### Edge Cases

- Etapa gatillo, de éxito o de expiración eliminada después de configurar el
  follow-up: el sistema deja de considerar leads para esa configuración (no falla,
  se comporta como si esa transición no estuviera configurada) hasta que el
  operador la reconfigure.
- Un lead que retrocede manualmente a la etapa gatillo desde otra etapa: vuelve a
  ser candidato a follow-up con normalidad (se evalúa por posición actual, no por
  historial).
- Conversación de prueba del Laboratorio (`is_test`): el follow-up JAMÁS le envía
  mensajes reales — respeta el mismo guardrail de sandbox que el resto del envío.
- Organización sin ninguna conversación/canal conectado: el intento de envío falla
  igual que cualquier otro envío sin canal — se registra como fallido, no rompe el
  ciclo del scheduler para el resto de los leads.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir configurar, por organización: habilitado
  (sí/no), etapa gatillo, intervalo (valor numérico + unidad horas/días), mensaje de
  seguimiento, etapa de éxito, etapa de expiración, y si requiere documento.
  Ninguno de estos valores MUST estar fijo en el código.
- **FR-002**: El sistema MUST revisar periódicamente (en segundo plano, sin
  intervención del operador) los leads en la etapa gatillo de organizaciones con
  follow-up habilitado.
- **FR-003**: El sistema MUST enviar el mensaje configurado a un lead cuya última
  actividad supera el intervalo configurado, y MUST hacerlo como máximo una vez por
  período de inactividad (no reenviar en cada revisión).
- **FR-004**: El envío del recordatorio MUST usar el mismo camino de envío ya
  existente (respeta canal oficial/no oficial de la conversación, guardrail de
  sandbox `is_test`).
- **FR-005**: Si "requiere documento" está habilitado, recibir un documento/imagen
  de un lead en la etapa gatillo MUST moverlo automáticamente a la etapa de éxito y
  MUST cancelar cualquier recordatorio pendiente de expiración para ese lead.
- **FR-006**: Un lead que respondió (nueva actividad) después de recibir su
  recordatorio MUST NOT expirar automáticamente.
- **FR-007**: Un lead que no respondió ni envió el documento requerido tras el
  plazo de gracia posterior al recordatorio MUST moverse automáticamente a la etapa
  de expiración, si hay una configurada.
- **FR-008**: El sistema MUST poder deshabilitar el follow-up sin perder la
  configuración guardada (para volver a habilitarlo después con los mismos valores).
- **FR-009**: Un fallo de envío a un lead puntual MUST NOT interrumpir la revisión
  del resto de los leads en el mismo ciclo.

### Key Entities

- **Configuración de follow-up**: una por organización; habilitado, etapa gatillo,
  intervalo (valor + unidad), mensaje, etapa de éxito, etapa de expiración, si
  requiere documento.
- **Envío de follow-up**: registro de un recordatorio enviado a un lead — a qué
  lead, cuándo, estado (enviado/cancelado/expirado) — existe para no reenviar de
  más y para saber a quién ya se le venció el plazo de gracia.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un operador puede configurar el follow-up completo (habilitar,
  intervalo, mensaje, etapas) en menos de 1 minuto sin ayuda técnica.
- **SC-002**: El 100% de los leads que superan el intervalo configurado sin
  actividad reciben el recordatorio dentro de un ciclo de revisión del sistema (no
  se "escapan" leads elegibles).
- **SC-003**: Cero recordatorios duplicados a un mismo lead por el mismo período de
  inactividad.
- **SC-004**: Un documento recibido de un lead con "requiere documento" habilitado
  lo mueve a la etapa de éxito sin intervención manual, en el mismo ciclo de
  ingesta del mensaje (no espera al próximo ciclo del scheduler).

## Assumptions

- **Un pipeline por organización**: este proyecto no modela múltiples pipelines
  con nombre — hay un único tablero de etapas por organización (confirmado en el
  código: `pipelineStage` no tiene una FK a un "pipeline" propio). La configuración
  de follow-up es entonces una config singular por organización, no por-pipeline
  como sugería el roadmap original.
- **Plazo de gracia de expiración = mismo intervalo configurado**: el roadmap no
  especifica un plazo de expiración separado del intervalo del recordatorio. Se
  asume que el plazo de gracia tras el recordatorio es el mismo valor que el
  intervalo de disparo (p. ej., 4 horas para recordar + 4 horas más de gracia = 8
  horas totales sin respuesta hasta expirar). Puede exponerse como un valor
  independiente en una iteración futura si el dueño lo pide.
- **Un solo recordatorio por período de inactividad**: no hay reintentos ni
  segundo aviso — si no hay respuesta tras el plazo de gracia, se expira
  directamente (no hay "recordatorio 2 de 3").
- **La revisión periódica corre dentro del mismo proceso Node** (Constitución II),
  con un intervalo de revisión configurable vía variable de entorno — igual que el
  resto de trabajo en segundo plano de este proyecto (turno del agente, Laboratorio).
- **Fuera de alcance de este sprint** (ya cubierto por trabajo previo, ver
  memoria del proyecto): el motor de canal no oficial y su pantalla de conexión/QR
  — ya existen. La UI de renderizado de medias en la bandeja — ya existe.
