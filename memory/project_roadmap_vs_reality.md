---
name: project-roadmap-vs-reality
description: The pasted vocero_roadmap.md assumes a much earlier starting point than the actual codebase — most of it already exists
metadata:
  type: project
---

On 2026-07-26 the owner pasted a `vocero_roadmap.md` describing 4 phases (template
shortcut, mass campaigns, an internal Baileys/Evolution WhatsApp engine, media
detection) as if starting from a bare WhatsApp Cloud API-only CRM. The actual
codebase was already far more advanced:

- **Unofficial WhatsApp channel already implemented**: `unofficialChannel` table,
  `conversation.channel` enum (`official`/`unofficial`, sticky — follows whichever
  channel the customer last used), adapters for Evolution/WPPConnect/WAHA in
  `src/lib/unofficial/`, ingest in `src/server/unofficial/`, settings UI at
  `src/components/settings/channels-client.tsx`. This is Roadmap "Fase 2" — done,
  just using gateway APIs instead of a raw Baileys library connection.
- **Media rendering + proxy already implemented**: `message.mediaUrl` in schema,
  `/api/media/[id]` authenticated proxy, `MediaContent` in
  `src/components/inbox/message-thread.tsx` (image/audio/video/document/sticker).
  This is Roadmap "Fase 3" — done.
- **Template sending already implemented**: `/api/templates`, `TemplateSender`
  component, `sendTemplate` in `src/server/whatsapp/templates.ts` (real Graph API
  call with components/variables). Only the "/" slash-command UX trigger from the
  roadmap's "Fase 1A" was actually missing — the backend and a manual selector
  already existed.
- **Genuinely new** (from the roadmap): the "/" slash template picker and mass
  Campaigns — neither existed before 2026-07-26.

**Why this matters**: don't assume a roadmap document reflects the current state of
the repo, even a detailed one — always discover the actual code before scoping work
against it. Re-reading a roadmap against `git log`/`grep` first would have saved a
full re-specification cycle.

**How to apply**: before planning any future phase of `vocero_roadmap.md` (Sprint 2
Campañas onward), re-verify against the current codebase first — assume less has
changed than the roadmap implies is "still needed," not more.

See also [[constitution-v2-hybrid-channel]] for the related constitution amendment,
and [[local-dev-e2e-gotchas]] for environment gotchas hit while verifying Sprint 1.
