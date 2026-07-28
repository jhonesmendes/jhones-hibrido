# Implementation Plan: Motor WhatsApp no oficial nativo (Baileys)

**Branch**: `006-motor-baileys-nativo` | **Date**: 2026-07-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-motor-baileys-nativo/spec.md`

## Summary

Reemplaza por completo la capa de adaptadores de gateway (`src/lib/unofficial/*`,
webhook público, columnas de proveedor/URL/API-key) por un motor propio que habla
el protocolo de WhatsApp Web directamente (`@whiskeysockets/baileys`), corriendo
in-process. Sin webhook: los eventos de mensajes/conexión llegan por callbacks del
socket dentro del mismo proceso. La sesión pareada (credenciales + claves de
Signal) se persiste cifrada en Postgres — mismo estándar de cifrado que el resto
del proyecto — para sobrevivir reinicios (US3). El estado de conexión se expone
por el mismo bus SSE ya usado por bandeja/Laboratorio/Campañas, eliminando el
polling actual de 5s.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js (runtime `nodejs` explícito en las
rutas afectadas — Baileys usa APIs de Node no disponibles en edge).

**Primary Dependencies**: `@whiskeysockets/baileys` (nueva — conexión directa,
sin servidor intermedio) + `qrcode` (nueva — solo para convertir el string de QR
en una imagen PNG que ya sabemos mostrar). Sin dependencias de red hacia
terceros: Baileys conecta directo a los servidores de WhatsApp.

**Storage**: PostgreSQL vía Drizzle. La tabla `unofficial_channel` se reescribe
(migración): fuera `provider`/`baseUrl`/`instanceName`/`apiKey*`/`webhookToken`;
dentro `authStateCipher/Iv/Tag` (blob JSON cifrado con las credenciales +
almacén de claves de Baileys).

**Testing**: Vitest para la lógica de normalización de mensajes entrantes/estado
(pura, sin socket real). El pareo real (QR + WhatsApp real) NO es automatizable
— ver spec.md → Assumptions; queda como verificación humana explícita.

**Target Platform**: Node self-hosted, proceso único de larga duración (mismo
supuesto que Campañas/Follow-up: nada de esto funciona en serverless).

**Constraints**: Un socket activo por organización conectada, viviendo en memoria
del proceso (`Map` module-level) — se reconstruye al reiniciar desde la sesión
persistida (US3). Sin S3/almacenamiento de objetos (Principio II) — por eso
media queda fuera de esta iteración (necesitaría persistir bytes o reintentar
descarga bajo demanda contra un socket que podría no seguir vivo).

**Scale/Scope**: una sesión por organización — mismo supuesto de "un negocio por
instancia" ya vigente en todo el proyecto.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Seguridad de Datos**: la sesión de WhatsApp (equivalente a un secreto de
  autenticación) se cifra en reposo con el mismo `lib/crypto` AES-256-GCM que ya
  protege el token de Meta y las API keys de gateway. PASS.
- **II. Soberanía (v2.0.0)**: elimina una dependencia externa real (los procesos
  gateway Evolution/WPPConnect/WAHA) — Baileys es una librería que conecta
  directo a WhatsApp, sin servidor intermedio propio. Más soberano que el estado
  actual, no menos. Ya nombrado explícitamente en el texto de la constitución
  ("conexión directa tipo WhatsApp Web (Baileys)"). PASS.
- **III. Multi-tenancy**: un socket + una sesión por `organizationId`, `Map`
  keyed por organización, columnas con `organization_id` NOT NULL + `scoped()`.
  PASS.
- **IV. Idempotencia**: reutiliza `ingestInboundMessage` tal cual (ya idempotente
  por `wa_message_id` único) — el motor solo normaliza y llama esa función, no
  reimplementa idempotencia. PASS.
- **V. Calidad Verificable**: gate típecheck+lint+build+test. El pareo real con
  un teléfono queda marcado explícitamente como verificación humana (no
  automatizable) — no se reporta como "hecho" sin esa marca. PASS.
- **VI. Specs Antes de Código**: este plan y spec preceden la implementación.
  PASS.
- **VII. Trazabilidad**: recorte de alcance (sin media) y la imposibilidad de
  automatizar el pareo real documentados en spec.md → Assumptions. PASS.
- **VIII. Foco Vertical**: sigue siendo el mismo canal de conversaciones/leads de
  WhatsApp — cambia CÓMO se conecta, no QUÉ hace. PASS.
- **IX. Verificación en Vivo**: todo lo automatizable (persistencia de sesión,
  ciclo de vida connect/disconnect, normalización de mensajes, ruteo de envío)
  se verifica con pruebas reales antes de "Hecho". El pareo QR↔teléfono real es
  la única pieza que el propio Principio IX reconoce como delegable a
  verificación humana ("aprobación de un tercero" / lo intrínsecamente no
  verificable por herramientas — acá, un WhatsApp real ajeno al entorno).

Sin violaciones — no aplica Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/006-motor-baileys-nativo/
├── plan.md
├── spec.md
├── data-model.md
├── tasks.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
├── lib/db/schema.ts                     # unofficial_channel reescrita
├── server/baileys/
│   ├── auth-state.ts                    # AuthenticationState persistido en BD, cifrado
│   ├── manager.ts                       # connect/disconnect/getLiveStatus, Map in-process
│   ├── inbound.ts                       # normaliza mensajes del socket → ingestInboundMessage
│   └── sender.ts                        # sendText(organizationId, phone, text)
├── server/unofficial/                   # ELIMINADO (channel.ts, ingest.ts)
├── lib/unofficial/                      # ELIMINADO (adapters de gateway)
├── app/api/webhooks/unofficial/         # ELIMINADO (ya no hay webhook)
├── app/api/settings/channels/           # reescrita: POST connect, DELETE disconnect
│   └── route.ts                         # (sin GET status por polling — ver SSE)
├── app/api/media/[id]/route.ts          # deshabilitado para canal no oficial en
│                                          esta iteración (ver Assumptions)
├── server/inbox/send.ts                 # sendViaUnofficial → llama a server/baileys/sender
├── server/events/bus.ts                 # + evento "channel.status"
├── instrumentation.ts                   # + reconectar sesiones ya pareadas al arrancar
└── components/settings/
    └── channels-client.tsx              # reescrita: sin campos de gateway, QR/estado vía SSE
```

**Structure Decision**: nuevo dominio `src/server/baileys/` reemplaza
`src/lib/unofficial/` + `src/server/unofficial/` por completo (FR-010) —
consistente con el patrón `src/server/<dominio>/` ya usado en el proyecto. El
webhook público desaparece: el motor corre in-process, los eventos llegan por
callbacks directos del socket.

## Complexity Tracking

*(vacío — no hay violaciones que justificar)*
