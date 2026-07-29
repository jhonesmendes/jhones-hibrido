---
name: migration-timestamp-landmine
description: drizzle-orm's migrator applies migrations by comparing journal "when" (epoch ms) to MAX(created_at) already in the DB — migration 0007's when is set in the future (2026-07-29T16:00 UTC), silently no-op'ing every migration generated after it until real time catches up
metadata:
  type: project
---

`drizzle/meta/_journal.json`'s entry for `0007_access_control` has
`"when": 1785340800000` = **2026-07-29T16:00:00.000Z** — set to a round
future timestamp (looks intentional/manual, not `Date.now()`) sometime during
that feature's work. This is NOT the same issue as
[[drizzle_snapshot_drift_fixed]] (that was about missing/stale
`meta/*_snapshot.json` files breaking `drizzle-kit generate`'s diff) — this
one breaks *applying* migrations, in both `drizzle-kit migrate` (CLI) and the
real production path, `scripts/migrate.mjs` (uses
`drizzle-orm/postgres-js/migrator`'s `migrate()` directly, run at container
boot per the Dockerfile: `CMD ["sh","-c","node migrate.mjs && node server.js"]`).

**Root cause** (`pg-core/dialect.js`'s `migrate()`): it does NOT hash-diff
every migration against the DB. It fetches `MAX(created_at)` from
`__drizzle_migrations`, then applies any journal entry whose `when` is
greater than that cursor. Any migration generated normally after 0007 (real
`Date.now()`, e.g. `0008_ai_config` at `...T02:22Z`,
`0009_n8n_config` at `...T02:36Z`) has a SMALLER `when` than 0007's inflated
future value — so the cursor check `folderMillis > lastDbMigration.created_at`
is false, and the migration is **silently skipped, no error, exit 0**. Both
`drizzle-kit migrate` and `node scripts/migrate.mjs` reported success while
doing nothing.

**Fixed on 2026-07-29** by bumping only `0008`/`0009`'s `when` to
`1785340800001` / `1785340800002` (1-2ms after 0007) — safe for both a
database that already applied 0007 with the inflated `created_at` (its
cursor is already pinned at `1785340800000`, so anything just above it now
applies) and a brand-new install (still monotonic 0000→0009). Left 0007's own
`when` untouched — already baked into every DB that ran it; changing it
wouldn't help and adds risk for no benefit.

**Why this matters**: I discovered this only because a live self-test showed
`relation "ai_config" does not exist` (500) after "successful" migrations —
typecheck/lint/unit tests never would have caught it, since nothing in this
repo runs migrations against a real Postgres as part of CI. Both stages that
added a migration after 0007 (IA config, N8N config) would have silently
missed their tables in ANY environment that already had 0007 applied —
including, plausibly, the user's real deployed containers if they'd pulled
this branch before this fix.

**How to apply — landmine is NOT fully defused**: until real wall-clock
time passes 2026-07-29T16:00 UTC, `drizzle-kit generate` for the next new
migration will again produce a `when` smaller than 0007's, and would
silently no-op again in any environment that already has 0007+ applied.
Before trusting a newly-generated migration, always confirm its `when` in
`drizzle/meta/_journal.json` is greater than the chain's current high-water
mark — if not, bump it by hand. Verify with: apply it against a DB that
already has migrations through the previous one, and confirm the target
table actually appears (don't trust "migrations applied successfully"
alone — it does not mean anything ran).

**Confirmed recurring** (2026-07-29, again): `0010_campaign_scheduling`
generated with `when: 1785300370566` — again below the chain's high-water
mark. Fixed the same way: bumped to `1785340800003` (next in the
`...800000 / ...001 / ...002` sequence).

**Confirmed recurring a third time** (same day): `0011_media_metadata`
generated with `when: 1785332355883` — same pattern, bumped to
`1785340800004`. Current safe floor for the *next* migration: **greater
than 1785340800004**. This will keep happening on every single migration
generated in this session until real wall-clock time passes
2026-07-29T16:00 UTC — at that point `Date.now()` will naturally exceed the
chain's high-water mark again and this stops being necessary.
