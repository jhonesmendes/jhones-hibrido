# Data Model: Follow-up automático de pipeline

## Entidades

### `pipeline_followup` (1 fila por organización, como `agent_profile`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefijo `pfu_` |
| `organizationId` | text NOT NULL UNIQUE FK → organization | scoped, singleton |
| `enabled` | boolean NOT NULL default false | |
| `triggerStageId` | text NULL FK → pipeline_stage | etapa que activa el follow-up |
| `intervalValue` | integer NOT NULL default 4 | |
| `intervalUnit` | enum `hours` \| `days` NOT NULL default `hours` | |
| `message` | text NULL | mensaje configurable, sin nada fijo |
| `successStageId` | text NULL FK → pipeline_stage | al recibir documento (si aplica) |
| `expiredStageId` | text NULL FK → pipeline_stage | al vencer el plazo de gracia |
| `requiresDocument` | boolean NOT NULL default false | |
| `updatedAt` | timestamp NOT NULL default now() | |

### `followup_send` (registro/idempotencia — no es una cola con fecha futura;
se crea en el momento en que el recordatorio efectivamente se envía)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefijo `fus_` |
| `organizationId` | text NOT NULL | scoped |
| `leadId` | text NOT NULL FK → lead (cascade) | |
| `conversationId` | text NOT NULL FK → conversation | |
| `message` | text NOT NULL | copia del mensaje enviado (auditoría; si se
  edita la config después, no cambia el historial) |
| `status` | enum `sent` \| `failed` \| `cancelled` \| `expired` NOT NULL | no hay
  `pending`: se crea ya con el resultado del intento de envío |
| `sentAt` | timestamp NOT NULL default now() | |
| `resolvedAt` | timestamp NULL | cuándo pasó a `cancelled`/`expired` |

Índice: `uniqueIndex("followup_send_lead_active_uq").on(leadId).where(status IN
('sent'))` — como máximo un recordatorio "activo" (esperando resolución) por lead
a la vez; ver Lógica de elegibilidad más abajo para cómo se permite uno nuevo tras
resolverse.

## Lógica de elegibilidad (server/pipeline/followup-scheduler.ts)

Por cada organización con `pipeline_followup.enabled = true`:

1. **Enviar recordatorio**: leads con `stageId = triggerStageId` AND
   `lead.lastActivityAt < now() - interval` AND sin una fila `followup_send` con
   `status = 'sent'` cuyo `sentAt > lead.lastActivityAt` (es decir: no se le
   recordó ya desde su última actividad — si respondió después de un recordatorio
   viejo, ese recordatorio deja de "contar" y puede recibir uno nuevo la próxima
   vez que quede inactivo). → enviar `sendText(...)`, insertar `followup_send`
   (`status: 'sent'` en éxito, `'failed'` si `sendText` lanza — no se reintenta en
   el mismo ciclo, sí en el siguiente).
2. **Expirar**: leads con `stageId = triggerStageId` AND una fila `followup_send`
   `status = 'sent'` con `sentAt < now() - interval` (mismo intervalo = plazo de
   gracia, ver spec.md → Assumptions) AND `lead.lastActivityAt <= followup_send.sentAt`
   (sin actividad nueva desde que se envió) → si `expiredStageId` está configurado,
   mover `lead.stageId = expiredStageId` y marcar el `followup_send`
   `status = 'expired'`, `resolvedAt = now()`.

## Lógica reactiva (server/pipeline/followup-document.ts, llamado desde
`ingestInboundMessage` en `server/inbox/ingest.ts` cuando el mensaje entrante es
de tipo media)

Si `pipeline_followup.requiresDocument = true` AND el lead del contacto está en
`triggerStageId` → mover `lead.stageId = successStageId` (si está configurado) y
marcar cualquier `followup_send` `status = 'sent'` de ese lead como `'cancelled'`
(`resolvedAt = now()`).

## Contratos de API

### `GET /api/pipeline/followup`

Devuelve la configuración de la organización (o los valores por defecto si nunca
se guardó ninguna).

### `PUT /api/pipeline/followup`

Body: `{ enabled, triggerStageId, intervalValue, intervalUnit, message,
successStageId, expiredStageId, requiresDocument }`.

- Si `enabled = true`: `triggerStageId` y `message` (no vacío) MUST estar
  presentes (FR-001/acceptance #4) — 422 si faltan.
- Upsert por `organizationId` (como `agent_profile`).

## Arranque del scheduler

`src/instrumentation-node.ts` (arranque único del proceso) llama
`startFollowupScheduler()`, que registra un `setInterval` module-level (mismo
patrón anti-doble-registro que `scheduleAgentTurn` vía `globalThis`) con período
`FOLLOWUP_SCHEDULER_INTERVAL_MS` (env var, default 5 min). Cada tick recorre todas
las organizaciones con `pipeline_followup.enabled = true` y corre la lógica de
elegibilidad de arriba.
