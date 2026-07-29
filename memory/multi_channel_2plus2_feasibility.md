---
name: multi-channel-2plus2-feasibility
description: Feasibility analysis for supporting 2 official + 2 WhatsApp Web channels per organization — confirmed possible, scoped as its own future feature, not started
metadata:
  type: project
---

Owner asked (2026-07-29) whether the CRM could support up to **2 official
(Meta Cloud API) channels + 2 WhatsApp Web (Baileys) channels per
organization**, instead of today's 1+1 max. Investigated the code and
confirmed: **technically possible, but a real feature, not a config
change.**

**What already supports it**: the Meta webhook already routes inbound
messages by `phone_number_id` (globally unique), not by organization — so
"which of several numbers received this" already works at the ingestion
layer.

**What actually blocks it today** — three concrete things:
1. `meta_credentials_org_uq` and `unofficial_channel_org_uq` — hard `UNIQUE`
   DB constraints allowing only one row per organization per channel type
   (`src/lib/db/schema.ts`).
2. `conversation.channel` is a **type** enum (`official`/`unofficial`), not a
   reference to a specific number/instance. With 2 official numbers, a
   conversation needs to know *which one*, not just "official" — touches the
   conversation model, `send.ts`, `ingest.ts`, and the whole Canais UI
   (which would need to become a real list with a name per number, like the
   original mockup showed — "CCD", "Suporte TI" — rather than the two fixed
   tabs built in [[sprint_frontend_mockups]] if that memory exists, or just
   the unified two-tab Canais screen shipped 2026-07-28/29).
3. WhatsApp Web is a **live in-process session** (one Baileys WebSocket per
   org today, `src/server/baileys/manager.ts` keyed by `organizationId`).
   Two simultaneous connections per org means keying by channel-instance id
   instead, and doubles the operational surface (2x chance either session
   drops).

**Decision**: owner chose to document this for now, not implement
immediately (2026-07-29). Treat as its own future feature/spec if picked
up — needs a proper migration (drop the org-unique constraints, add a
`name`/`label` field per channel row), a `channelId` on `conversation`
pointing at the specific credential row, and rework of the Canais settings
UI into a real multi-item list with per-number connect/disconnect/name.

**How to apply**: if the owner brings this up again, don't re-derive the
analysis — start from here. Confirm this memory is still accurate first
(check `meta_credentials_org_uq`/`unofficial_channel_org_uq` still exist)
since schema may have changed since this was written.
