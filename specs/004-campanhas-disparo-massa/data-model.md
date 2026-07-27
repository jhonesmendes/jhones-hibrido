# Data Model: Campañas de disparo en masa

## Entidades

### `campaign`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefijo `camp_` |
| `organizationId` | text NOT NULL FK → organization | scoped |
| `name` | text NOT NULL | |
| `channel` | enum `official` \| `unofficial` NOT NULL | |
| `templateId` | text NULL FK → template | solo canal oficial |
| `messageTemplate` | text NULL | solo canal no oficial; cuerpo con `{{variable}}` |
| `sendIntervalMs` | integer NOT NULL default 5000 | editable siempre; guardrail duro en no oficial |
| `status` | enum `draft` \| `sending` \| `sent` \| `cancelled` NOT NULL default `draft` | |
| `total` | integer NOT NULL default 0 | |
| `sent` | integer NOT NULL default 0 | incluye fallidos ya procesados (ver `failed`) |
| `failed` | integer NOT NULL default 0 | |
| `cancelRequested` | boolean NOT NULL default false | el loop la revisa entre cada envío |
| `startedAt` / `completedAt` | timestamp NULL | |
| `createdAt` | timestamp NOT NULL default now() | |

Índice: `(organizationId, createdAt)`.

### `campaign_recipient`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefijo `crc_` |
| `campaignId` | text NOT NULL FK → campaign (cascade) | |
| `organizationId` | text NOT NULL | scoped, denormalizado para queries directas |
| `phone` | text NOT NULL | tal como viene del CSV, normalizado |
| `variables` | jsonb NULL | `{"1": "valor"}` (oficial) o `{"nome": "...", ...}` (no oficial) |
| `contactId` | text NULL FK → contact | se completa al procesar |
| `conversationId` | text NULL FK → conversation | idem |
| `messageId` | text NULL FK → message | mensaje real enviado, si tuvo éxito |
| `status` | enum `pending` \| `sent` \| `failed` NOT NULL default `pending` | |
| `error` | text NULL | motivo si `failed` |
| `createdAt` | timestamp NOT NULL default now() | |

Índice: `(campaignId, status)`.

**Por qué no reutilizar solo `message`**: un destinatario puede fallar ANTES de que
exista un mensaje (p. ej. teléfono inválido, plantilla rechazada a mitad de camino)
— necesita su propio estado independiente del mensaje.

## Contratos de API

Todas las rutas bajo `withAuth`, scoped por `session.organizationId`, mismos
patrones de error (`apiError`) que el resto del proyecto.

### `POST /api/campaigns/import-csv`

Body: `{ csvText: string }` (el archivo se lee en el cliente con `FileReader`, se
manda como texto — sin subir binarios, sin storage nuevo).

Respuesta: `{ validRows: {phone, variables}[], invalidRows: {line, reason}[],
detectedVariables: string[] }`. No persiste nada — es solo previsualización.

### `POST /api/campaigns`

Body: `{ name, channel: "official", templateId, csvText } | { name, channel:
"unofficial", messageTemplate, sendIntervalMs, riskAcknowledged: true, csvText }`.

- Valida plantilla aprobada (oficial) o canal conectado (no oficial).
- `riskAcknowledged` MUST ser `true` para no oficial (FR-005) — 422 si falta.
- Parsea el CSV (mismo parser que `import-csv`), crea la campaña en `draft` + sus
  `campaign_recipient` en una transacción.

Respuesta: `{ campaign }` (201).

### `GET /api/campaigns`

Lista campañas de la organización, más recientes primero (FR-013).

### `GET /api/campaigns/[id]`

Detalle + lista de destinatarios (para la tabla del detalle).

### `POST /api/campaigns/[id]/send`

- 409 si la campaña no está en `draft` (FR-011).
- Marca `status = "sending"`, `startedAt = now()`, devuelve 200 de inmediato, y
  dispara el loop en segundo plano (no bloquea la respuesta HTTP) — mismo patrón
  in-process que el turno del agente (`src/server/ai/pipeline.ts`).
- El loop: por cada destinatario pendiente → `getOrCreateContact` +
  `getOrCreateConversation` (fijando `channel` de la conversación al canal de la
  campaña) → según canal, `sendTemplate(...)` o (tras fijar
  `conversation.channel = "unofficial"`) `sendText(...)` → actualiza el
  `campaign_recipient` y los contadores de la campaña → publica `campaign.run` por
  SSE → espera `sendIntervalMs` → revisa `cancelRequested` antes del siguiente.
- Al terminar (o cancelar), fija `status` final y `completedAt`.

### `POST /api/campaigns/[id]/cancel`

- 409 si la campaña no está en `sending`.
- Fija `cancelRequested = true`; el propio loop la detecta y cierra
  (FR-010/SC-003).

## Evento SSE nuevo

`{ type: "campaign.run"; data: { campaignId, status, total, sent, failed } }` —
agregado a `SseEvent` en `src/server/events/bus.ts`, mismo patrón que `lab.run`.
