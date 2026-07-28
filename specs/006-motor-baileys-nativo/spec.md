# Feature Specification: Motor WhatsApp no oficial nativo (Baileys)

**Feature Branch**: `006-motor-baileys-nativo`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "La aplicación está usando Evolution, WPPConnect y WAHA — herramientas de terceros. Vamos a cambiar esto para que sea interno, sin terceros: el propio Vocero será el motor completo de la API no oficial. La pantalla de conexión tiene que rehacerse para atender el propio motor. Así evitamos delay o problemas de traba."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conectar el número no oficial sin un gateway externo (Priority: P1)

Como operador, quiero conectar mi número de WhatsApp no oficial escaneando un QR
directamente en Vocero, sin instalar ni configurar un gateway externo (Evolution,
WPPConnect o WAHA), para tener un solo sistema del que depender.

**Why this priority**: Es la puerta de entrada a todo lo demás — sin conexión no
hay canal no oficial que usar.

**Independent Test**: Abrir Configurações → Canal não oficial, iniciar la
conexión, ver el QR generado por el propio Vocero, escanearlo con un WhatsApp
real, y verificar que el estado pasa a "Conectado" con el número mostrado, sin
requerir ninguna URL/instancia/API key de terceros.

**Acceptance Scenarios**:

1. **Given** ningún canal no oficial conectado, **When** el operador abre la
   pantalla de conexión, **Then** ve un botón para iniciar la conexión — sin
   campos de proveedor, URL de gateway, instancia o API key.
2. **Given** la conexión iniciada, **When** el motor genera el QR, **Then** la UI
   lo muestra en vivo (sin recargar la página) en pocos segundos.
3. **Given** el QR escaneado con un WhatsApp real, **When** el pareo se
   completa, **Then** el estado pasa a "Conectado" y muestra el número, en vivo.
4. **Given** un canal ya conectado, **When** el operador elige desconectar,
   **Then** la sesión se cierra y se borra de forma que reconectar exige un QR
   nuevo (no queda una sesión fantasma).

---

### User Story 2 - Enviar y recibir mensajes de texto por el motor nativo (Priority: P1)

Como negocio con el canal no oficial conectado, quiero que enviar y recibir
mensajes de texto por WhatsApp funcione exactamente igual que antes (misma
bandeja, mismo pipeline, mismos leads), pero sin pasar por un servidor gateway
intermedio.

**Why this priority**: Es el propósito del canal — sin esto, conectar (US1) no
sirve de nada.

**Independent Test**: Con el canal conectado, enviar un mensaje de texto desde
la bandeja a un número real y verificar que llega al WhatsApp del destinatario;
responder desde ese WhatsApp real y verificar que el mensaje aparece en la
bandeja de Vocero en tiempo real, con el contacto/conversación/lead creados
igual que hoy.

**Acceptance Scenarios**:

1. **Given** una conversación cuyo canal activo es "no oficial", **When** el
   operador envía un mensaje de texto, **Then** sale por el motor nativo — sin
   llamar a ningún servicio externo.
2. **Given** un mensaje de texto entrante de un contacto por el número no
   oficial, **When** el motor lo recibe, **Then** se ingesta con el mismo
   pipeline idempotente que ya existe (contacto, conversación, lead, turno del
   agente si aplica) — igual que si viniera de cualquier otro canal.
3. **Given** una conversación de prueba del Laboratorio (`is_test`), **When**
   se intenta enviar por este canal, **Then** el envío real sigue prohibido
   (mismo guardrail de sandbox ya existente).
4. **Given** el canal no está conectado, **When** se intenta enviar, **Then**
   el sistema lo rechaza con un mensaje claro (mismo comportamiento que hoy
   ante "canal no conectado").

---

### User Story 3 - El motor se reconecta solo al reiniciar el servidor (Priority: P2)

Como negocio que ya conectó su número, quiero que un reinicio del servidor (un
deploy, por ejemplo) no me obligue a escanear el QR de nuevo, para no depender
de que alguien esté mirando la pantalla cada vez que la app se reinicia.

**Why this priority**: Sin esto, cada deploy rompería la conexión — inaceptable
para el uso real de un negocio, pero no bloquea demostrar US1/US2 primero.

**Independent Test**: Con el canal conectado, reiniciar el proceso del servidor
y verificar que, sin intervención manual, el estado vuelve a "Conectado" (o
"Conectando…" brevemente) sin pedir un QR nuevo.

**Acceptance Scenarios**:

1. **Given** una organización con sesión ya pareada, **When** el servidor
   arranca, **Then** el motor intenta restablecer esa sesión automáticamente.
2. **Given** la sesión ya no es válida en WhatsApp (el operador la cerró desde
   el celular), **When** el servidor intenta restablecerla, **Then** el estado
   queda "Desconectado" con claridad (no se queda "conectando" para siempre).

### Edge Cases

- Dos organizaciones distintas conectan números distintos al mismo tiempo: cada
  una tiene su propia sesión y socket, sin cruzarse (multi-tenant real).
- El operador cierra la pestaña mientras el QR está en pantalla: el motor sigue
  esperando el pareo del lado del servidor; al volver a abrir la pantalla, ve el
  mismo QR vigente o uno nuevo si venció.
- Mensajes de grupos o de difusión (broadcast) entrantes: se ignoran (este
  producto es 1 negocio → sus contactos, no grupos — mismo alcance que ya
  aplican los adaptadores actuales).
- Mensaje de medios (imagen, audio, documento) entrante: se descarga, descifra
  y guarda (ver Assumptions) — se previsualiza igual que el canal oficial.
- Fallo de red hacia los servidores de WhatsApp durante el envío: se reporta
  como fallo de envío normal (mismo tipo de error ya manejado), no cuelga el
  proceso ni al resto de las organizaciones.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir iniciar la conexión del canal no
  oficial sin pedir URL de gateway, proveedor, instancia ni API key de
  terceros — solo la acción de conectar.
- **FR-002**: El sistema MUST generar el código QR de pareo por sí mismo
  (conexión directa al protocolo de WhatsApp) y mostrarlo en la UI en vivo.
- **FR-003**: El estado de conexión (desconectado/conectando/conectado + número)
  MUST reflejarse en la UI en tiempo real, sin que el operador tenga que
  recargar la página.
- **FR-004**: El sistema MUST persistir la sesión pareada de forma que
  sobreviva a un reinicio del proceso, cifrada en reposo (mismo estándar que
  el resto de credenciales del proyecto).
- **FR-005**: El envío y la recepción de mensajes de texto por el canal no
  oficial MUST funcionar sin depender de ningún servidor o servicio externo —
  todo dentro del propio proceso de Vocero.
- **FR-006**: La recepción de mensajes MUST reutilizar el mismo pipeline de
  ingesta idempotente ya existente (contacto/conversación/lead/agente), sin
  duplicar esa lógica.
- **FR-007**: El guardrail de sandbox (conversaciones `is_test` jamás tocan un
  canal real) MUST seguir aplicando sin excepción.
- **FR-008**: El sistema MUST intentar restablecer automáticamente, al
  arrancar el proceso, la sesión de cada organización que ya estaba conectada.
- **FR-009**: Desconectar MUST cerrar la sesión de forma completa (no deja
  reconectar sin un QR nuevo).
- **FR-010**: Todo el código de los adaptadores de terceros (Evolution,
  WPPConnect, WAHA) y su webhook público MUST eliminarse del proyecto — no
  queda como opción alternativa ni como fallback.

### Key Entities

- **Sesión del canal no oficial** (reemplaza al "canal" actual): una por
  organización; credenciales de pareo con WhatsApp cifradas en reposo, número
  conectado, estado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un operador puede llegar de "sin canal no oficial" a "conectado
  y enviando mensajes" sin instalar ni configurar ningún software adicional
  fuera de Vocero.
- **SC-002**: El estado de conexión en la UI refleja la realidad dentro de 1-2
  segundos de un cambio real (conectado/desconectado/QR nuevo) — no minutos.
- **SC-003**: Un reinicio del servidor no exige volver a escanear el QR para
  una sesión que seguía válida en WhatsApp.
- **SC-004**: Cero llamadas de red salientes hacia un gateway de terceros
  (Evolution/WPPConnect/WAHA) en todo el código del canal no oficial.

## Assumptions

- **Descarga de media (revisado tras el self-test con WhatsApp real)**: la
  media entrante (imagen/audio/video/documento/sticker) por el canal no
  oficial se descifra vía Baileys al ingestar y se guarda en Postgres
  (tabla `message_media`, base64 — autohospedado, sin S3/R2 por la
  constitución de soberanía) en vez de solo el tipo/caption sin
  previsualización. `/api/media/[id]` sirve esos bytes igual que ya servía
  la URL del CDN de Meta para el canal oficial. Media saliente (enviar
  imagen/audio desde el composer) sigue fuera de alcance — el composer solo
  envía texto.
- **Reemplazo completo, sin período de convivencia**: no se mantiene Evolution/
  WPPConnect/WAHA como alternativa ni como fallback — la instrucción del dueño
  fue explícita ("sin terceros", "motor completo"). No hay datos de producción
  reales que migrar (instancia de desarrollo).
- **Verificación humana obligatoria e insustituible**: escanear el QR con un
  WhatsApp real y confirmar el intercambio de mensajes de verdad NO puede
  automatizarse en este entorno (no hay un "mock" posible para el protocolo
  real de WhatsApp, a diferencia de la Cloud API oficial que sí tiene wa-mock).
  Todo lo demás (persistencia de sesión, ciclo de vida de conexión, ruteo de
  envío/recepción hacia el pipeline existente) se verifica con pruebas
  automatizadas; el pareo real queda marcado como pendiente de verificación
  humana (Principio V/IX).
