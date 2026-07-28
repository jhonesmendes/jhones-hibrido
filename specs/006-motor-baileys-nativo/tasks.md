---

description: "Task list: motor WhatsApp no oficial nativo (Baileys)"
---

# Tasks: Motor WhatsApp no oficial nativo (Baileys)

**Input**: Design documents from `specs/006-motor-baileys-nativo/`

**Prerequisites**: plan.md, data-model.md, spec.md

**Tests**: unitarios para la normalización de mensajes entrantes (pura). El
pareo QR↔teléfono real NO es automatizable — queda como verificación humana
explícita (ver spec.md → Assumptions), no se finge una prueba que no existe.

## Phase 1: Setup

- [X] T001 `pnpm add @whiskeysockets/baileys qrcode` + `pnpm add -D
  @types/qrcode`.
- [X] T002 Migración: reescribir `unofficial_channel` en `src/lib/db/schema.ts`
  (ver data-model.md) — fuera columnas de gateway, dentro
  `authStateCipher/Iv/Tag`. `pnpm db:generate` + `pnpm db:migrate`.
- [X] T003 Agregar el evento `channel.status` a `SseEvent`
  (`src/server/events/bus.ts`) + handler `onChannelStatus` en
  `src/components/use-events.ts`.

**Checkpoint**: dependencias instaladas, schema migrado.

---

## Phase 2: User Story 1 - Conectar sin gateway externo (Priority: P1) 🎯 MVP

- [X] T010 [US1] `src/server/baileys/auth-state.ts`: `loadAuthState`,
  `SignalKeyStore` en memoria + `persist()` cifrado (ver data-model.md).
- [X] T011 [US1] `src/server/baileys/manager.ts`: `connect`, `disconnect`,
  `getLiveStatus` — maneja `connection.update` (QR, open, close),
  `creds.update` (persist). Runtime Node explícito donde haga falta.
- [X] T012 [US1] `src/app/api/settings/channels/route.ts` reescrita: POST
  (conectar), DELETE (desconectar), GET (estado inicial). Elimina
  `src/app/api/settings/channels/status/route.ts` (ya no hay polling).
- [X] T013 [US1] `src/components/settings/channels-client.tsz` reescrita: sin
  campos de proveedor/URL/instancia/API key — un botón "Conectar", QR/estado
  vía `useEvents({ onChannelStatus })`, botón "Desconectar" cuando conectado.
- [X] T014 [US1] Eliminar `src/lib/unofficial/` completo (types.ts,
  evolution.ts, wppconnect.ts, waha.ts, index.ts) y
  `src/server/unofficial/channel.ts` (FR-010).
- [X] T015 [US1] Eliminar `src/app/api/webhooks/unofficial/[webhookToken]/`
  (ya no hay webhook que recibir).

**Checkpoint**: conectar/desconectar funcional; pareo real pendiente de
verificación humana (no automatizable).

---

## Phase 3: User Story 2 - Enviar/recibir texto por el motor (Priority: P1)

- [X] T020 [US2] `src/server/baileys/inbound.ts`: `handleIncomingMessages` —
  filtra grupos/broadcast, normaliza tipo/texto/from, llama
  `ingestInboundMessage` (reuso directo).
- [X] T021 [US2] Enganchar `messages.upsert` del socket (en `manager.ts`) a
  `handleIncomingMessages`.
- [X] T022 [US2] `src/server/baileys/sender.ts`: `sendText(organizationId,
  phone, text)` sobre el socket activo; error tipado si no hay conexión.
- [X] T023 [US2] `src/server/inbox/send.ts`: `sendViaUnofficial` llama al
  nuevo `sender.ts` en vez de `getAdapter(...).sendText(...)`.
- [X] T024 [US2] Eliminar `src/server/unofficial/ingest.ts`
  (`processUnofficialWebhook`/`unofficialMessageId`) — reemplazado por T020.
- [X] T025 [US2] `src/app/api/media/[id]/route.ts`: sirve media del canal no
  oficial desde `message_media` (Postgres, base64, autohospedado) — revisado
  post self-test: implementado, ya no es 404 (ver spec.md → Assumptions,
  actualizado).
- [X] T025b [US2] `src/lib/db/schema.ts` (`messageMedia`) +
  `drizzle/0006_message_media_table.sql`: tabla nueva para los bytes de
  media del canal no oficial. `src/server/baileys/inbound.ts`:
  `downloadMedia()` vía `downloadMediaMessage` de Baileys (descarga +
  descifra, ya trae la clave en el mensaje). `src/server/inbox/ingest.ts`:
  `ingestInboundMessage` acepta `media` y lo persiste; `LOCAL_MEDIA_MARKER`
  exportado para que la ruta sepa distinguir "URL externa" de "bytes
  locales".
- [X] T026 [US2] [P] Tests unitarios de `inbound.ts` (normalización pura, sin
  socket real) en `tests/unit/baileys-inbound.test.ts`: texto simple, media
  sin preview, grupo ignorado, `fromMe` (eco), resolución de LID (dos casos
  nuevos post self-test: resuelve / descarta sin mapeo).

**Checkpoint**: envío/recepción de texto verificado en código; el intercambio
real con un WhatsApp de verdad queda para verificación humana.

---

## Phase 4: User Story 3 - Reconexión automática al reiniciar (Priority: P2)

- [X] T030 [US3] `src/server/baileys/manager.ts`: `reconnectAllOnBoot()` —
  lista organizaciones con fila en `unofficial_channel`, llama `connect()`
  para cada una.
- [X] T031 [US3] Enganchar `reconnectAllOnBoot()` en `src/instrumentation.ts`
  (junto a `cleanupOrphanRuns`/`startFollowupScheduler`).

**Checkpoint**: las 3 historias completas en código.

---

## Phase 5: Polish

- [X] T040 [P] Gate técnico completo: `pnpm typecheck && pnpm lint && pnpm
  build && pnpm test`.
- [X] T041 Self-test automatizable en vivo (Principio IX): arrancar el
  servidor, iniciar una conexión, verificar que llega un QR real por SSE
  dentro de unos segundos, verificar que `GET /api/settings/channels`
  refleja el estado, verificar que enviar sin conexión da el error esperado.
- [ ] T042 **Verificación humana obligatoria** (no delegable a herramientas,
  Principio IX): escanear el QR con un WhatsApp real, confirmar que el
  estado pasa a "Conectado" con el número correcto, enviar un mensaje desde
  la bandeja y confirmar que llega al teléfono real, responder desde el
  teléfono y confirmar que aparece en la bandeja. Reiniciar el servidor y
  confirmar que reconecta solo (US3) sin pedir QR de nuevo.

## Resultado del self-test (T040-T041)

Gate técnico, ejecutado dos veces (antes y después de la migración del
schema/entorno de prueba, ver Notes de la sesión) — verde en ambas:

```
pnpm typecheck  → TYPECHECK=0
pnpm lint       → LINT=0
pnpm exec vitest run --no-file-parallelism → 124/124 tests, 22/22 archivos
pnpm build      → BUILD=0 (17 rutas dinámicas compiladas, sin warnings de
                  resolución de módulos nativos)
```

Self-test de comportamiento en vivo (Playwright, `WA_MOCK_ENABLED=true`,
servidor real en `localhost:3001`, login real, sin mocks del motor Baileys —
este habla con los servidores reales de WhatsApp):

| # | Aserción | Resultado |
|---|---|---|
| 1 | US1: pantalla de conexión no pide URL/instancia/API key/proveedor de terceros | OK |
| 2 | US1: estado inicial muestra "Desconectado" | OK |
| 3 | US1: clic en "Conectar" cambia el estado a "Conectando…" en vivo (SSE) | OK |
| 4 | US1/SC-002: el motor nativo contacta los servidores reales de WhatsApp y genera un QR real (sin gateway de terceros) | OK |
| 5 | `GET /api/settings/channels` refleja el mismo estado que la UI (connecting + qrCode) | OK |
| 6 | US2 camino infeliz: enviar sin conexión confirmada falla limpio (409, `not_connected`) | OK |
| 7 | US1: desconectar limpia la sesión (estado vuelve a "Desconectado") | OK |

8/8 aserciones en verde. Lo que este self-test **no** cubre (no automatizable
— ver T042): el pareo real con un teléfono, el intercambio de mensajes real,
y la reconexión automática tras un reinicio con una sesión ya pareada.

## Dependencies & Execution Order

- Setup (T001-T003) bloquea todo lo demás.
- US1 (T010-T015) es la base — sin conexión no hay nada que enviar/recibir.
- US2 (T020-T026) depende de US1 (necesita `manager.ts` con un socket activo).
- US3 (T030-T031) depende de US1 (reconectar es solo "conectar de nuevo").
- Polish depende de las 3 historias; T042 es el cierre real de la feature —
  sin eso, no se declara "Hecha" (Principio IX), aunque todo el código ya
  esté verificado hasta donde las herramientas alcanzan.

## Notes

- Elimina por completo: `src/lib/unofficial/`, `src/server/unofficial/`,
  `/api/webhooks/unofficial/`, `/api/settings/channels/status/` — sin dejar
  código muerto ni una opción "modo gateway" alternativa (FR-010).
- Reutiliza: `ingestInboundMessage`, `lib/crypto` (cifrado), el bus SSE, el
  patrón `globalThis` de socket/estado in-process ya usado por
  Campañas/Follow-up.
- T042 no se puede ejecutar en este entorno de desarrollo — requiere un
  teléfono real con WhatsApp. Se documenta el resultado cuando el dueño lo
  ejecute, no se asume ni se finge.
