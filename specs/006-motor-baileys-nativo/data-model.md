# Data Model: Motor WhatsApp no oficial nativo (Baileys)

## Entidad

### `unofficial_channel` (reescrita — 1 fila por organización)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefijo `uch_` (ya existe) |
| `organizationId` | text NOT NULL UNIQUE FK → organization | scoped, singleton |
| `authStateCipher/Iv/Tag` | text NOT NULL (3 columnas) | JSON `{ creds, keys }` completo de Baileys, cifrado AES-256-GCM (mismo `lib/crypto` que el token de Meta) |
| `displayPhoneNumber` | text NULL | número mostrado tras el pareo |
| `status` | enum `disconnected` \| `connecting` \| `connected` NOT NULL default `disconnected` | |
| `createdAt` / `updatedAt` | timestamp | |

Se elimina: `provider`, `baseUrl`, `instanceName`, `apiKeyCipher/Iv/Tag`,
`webhookToken` (ya no hay proveedor que elegir ni webhook que enrutar).

## Motor (`src/server/baileys/`)

### `auth-state.ts`

Implementa el contrato `AuthenticationState` que Baileys espera
(`{ creds: AuthenticationCreds, keys: SignalKeyStore }`):

- `loadAuthState(organizationId)`: lee la fila cifrada (o `null` si nunca se
  conectó), descifra, deserializa `{ creds, keys }`. Si no existe, genera
  `creds` nuevas (`initAuthCreds()` de Baileys) y `keys = {}`.
- El `SignalKeyStore` se implementa como un objeto en memoria que mantiene TODO
  el mapa `keys` (get/set síncronos sobre el objeto) + una función
  `persist(organizationId)` que cifra y hace upsert del blob completo en BD.
  Se llama a `persist()` en cada `creds.update` del socket y tras cada
  `keys.set(...)` (Baileys llama esto con frecuencia durante el pareo; se
  persiste el blob completo cada vez — volumen bajo, un negocio chico, sin
  necesidad de optimizar con debounce en esta iteración).

### `manager.ts`

Estado module-level (mismo patrón `globalThis` que Campañas/Follow-up para
sobrevivir HMR en dev):

- `activeSockets: Map<organizationId, WASocket>`
- `liveStatus: Map<organizationId, { status, qr: string | null, phoneNumber: string | null }>`

Funciones:

- `connect(organizationId)`: si ya hay un socket activo, no-op. Carga el
  `AuthenticationState` (auth-state.ts), crea el socket
  (`makeWASocket({ auth: state, ... })`), engancha:
  - `connection.update` → si trae `qr`, genera PNG (`qrcode.toDataURL`),
    actualiza `liveStatus` y publica `channel.status` por SSE; si
    `connection === "open"`, marca `connected` + guarda `displayPhoneNumber`
    (de `sock.user.id`) en BD; si `connection === "close"`, decide
    reconectar (si no fue un logout explícito) o marcar `disconnected`.
  - `creds.update` → `persist()` del auth state.
  - `messages.upsert` → por cada mensaje nuevo, delega a `inbound.ts`.
- `disconnect(organizationId)`: `sock.logout()`, borra el socket del `Map`,
  borra la fila de `unofficial_channel` (fuerza QR nuevo la próxima vez, FR-009).
- `getLiveStatus(organizationId)`: lee `liveStatus` (fallback a BD si no hay
  socket activo — p. ej. tras un restart antes de que `connect()` corra).
- `reconnectAllOnBoot()`: lee todas las organizaciones con una fila en
  `unofficial_channel` (sesión pareada existente) y llama `connect()` para
  cada una — enganchado desde `instrumentation.ts` (US3).

### `inbound.ts`

`handleIncomingMessages(organizationId, messages: WAMessage[])`:

- Filtra: ignora mensajes de grupos/broadcast (`remoteJid` termina en `@g.us`
  o es `status@broadcast`), ignora mensajes sin `message` (notificaciones de
  protocolo).
- Normaliza: `from` = dígitos del JID, `type` = texto si
  `message.conversation`/`extendedTextMessage`, si no el tipo de media
  (`imageMessage` → `"image"`, etc. — mismo mapeo que ya existía en los
  adaptadores viejos, se traslada tal cual), `text` = cuerpo o caption,
  `fromMe` = `key.fromMe`, `waMessageId` = `unof:baileys:<key.id>` (mismo
  prefijo con namespace que ya usaba `unofficialMessageId`, adaptado).
- Llama `ingestInboundMessage(...)` (reuso directo, FR-006) con
  `channel: "unofficial"`, `mediaUrl: null` (sin media esta iteración).

### `sender.ts`

`sendText(organizationId, phone, text): Promise<string>`:

- Toma el socket activo del `manager` (lanza un error tipado si no hay
  conexión — mismo `SendError` ya usado por `sendViaUnofficial`).
- `sock.sendMessage(phone + "@s.whatsapp.net", { text })`, devuelve
  `res.key.id`.

## Cambios en código existente

- `src/server/inbox/send.ts` → `sendViaUnofficial` deja de llamar
  `getAdapter(...).sendText(...)` y llama a `server/baileys/sender.ts`
  directamente. El resto de la función (guardrail de sandbox, inserción del
  mensaje, publish SSE) no cambia.
- `src/server/events/bus.ts` → nuevo tipo `{ type: "channel.status"; data:
  { status: string; qrCode: string | null; phoneNumber: string | null } }`.
- `src/components/use-events.ts` → handler `onChannelStatus`.
- `src/instrumentation.ts` → tras `startFollowupScheduler()`, llama
  `reconnectAllOnBoot()`.

## Contratos de API (reescritos)

### `POST /api/settings/channels`

Body vacío. Dispara `connect(organizationId)` (fire-and-forget, como el resto
del trabajo en segundo plano del proyecto) y responde de inmediato — el QR
llega por SSE.

### `DELETE /api/settings/channels`

Llama `disconnect(organizationId)`.

### `GET /api/settings/channels`

Devuelve el estado actual (`getLiveStatus`, con fallback a BD) — se usa solo
para la carga inicial de la pantalla; las actualizaciones en vivo llegan por
SSE (`channel.status`), no por polling.
