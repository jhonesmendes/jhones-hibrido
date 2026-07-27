---
name: constitution-v2-hybrid-channel
description: Constitution amended to v2.0.0 on 2026-07-26 to legitimize the hybrid WhatsApp channel and permit mass Campaigns
metadata:
  type: project
---

The constitution ([.specify/memory/constitution.md](../.specify/memory/constitution.md))
was amended MAJOR (1.2.0 → 2.0.0) on 2026-07-26, at the owner's explicit choice
(offered via AskUserQuestion, "Enmendar la constitución" selected over scoping down
or discussing further).

- **Principio II (Soberanía)**: the closed list of runtime WhatsApp channels grew
  from "Cloud API only" to "Cloud API and/or a non-official channel (Baileys/
  Evolution/WPPConnect/WAHA), coexisting per organization." Turns out the
  non-official channel was *already implemented* in the codebase before this
  amendment (see [[project-roadmap-vs-reality]]) — the amendment retroactively
  legitimizes pre-existing code that technically violated the old v1.x wording.
- **Principio VIII (Foco Vertical)**: dropped the explicit exclusion of "broadcast
  masivo"; mass Campaigns (official templates + non-official free text) is now
  in-scope, gated by Principio IX guardrails (ban-risk warning in UI, always-
  configurable send interval, never hardcoded).

**Why**: the owner wants to build the full `vocero_roadmap.md` roadmap (Campaigns +
non-official engine), which the v1.x constitution explicitly forbade.

**How to apply**: any future spec/plan touching Campaigns or the non-official
channel should cite Principio II/VIII/IX v2.0.0, not the old wording. CLAUDE.md's
"Reglas de la constitución" section was updated in the same session to match.
