---
name: drizzle-snapshot-drift-fixed
description: drizzle-kit generate had stale/missing meta snapshots causing false rename prompts; fixed by reconstructing drizzle/meta/0007_snapshot.json
metadata:
  type: project
---

`drizzle-kit generate` used to prompt confusing "is this a rename?" questions
about `unofficial_channel` columns that had nothing to do with the change
being made. Root cause: two migrations were hand-written as custom SQL
without regenerating their snapshot —
`drizzle/0005_unofficial_channel_native_engine.sql` (switched
`unofficial_channel` from Evolution-gateway columns to native Baileys
`auth_state_cipher`/`iv`/`tag`) never got its `0005_snapshot.json` updated,
and `drizzle/0007_access_control.sql` (invite_token, member_permission,
member_channel, smtp_config, password_reset_token, audit_log,
member.is_active, conversation.assigned_to) had **no** snapshot file at all.
`drizzle-kit` was diffing `schema.ts` against a snapshot several migrations
stale, hence the false ambiguity.

Fixed on 2026-07-28 by reconstructing `drizzle/meta/0007_snapshot.json`: ran
`drizzle-kit generate` against an isolated temp config (empty `out` dir) to
get a correct fresh full-schema snapshot, then spliced it in as `0007`,
setting only `prevId` to `0006_snapshot.json`'s `id` (chain continuity) and
keeping the freshly generated `id`. No SQL file was touched — `0007` was
already applied to real databases; only the bookkeeping snapshot was wrong.
Verified with a throwaway test column: `generate` now produces a clean
single `ADD COLUMN` with zero prompts.

**Why**: this was blocking any future `pnpm db:generate` from being trusted
— every new migration risked surfacing bogus rename prompts (or worse, if
someone answered them wrong in a non-interactive/CI context, could have
generated destructive `DROP`/rename SQL against columns that already existed
correctly).

**How to apply**: if `drizzle-kit generate` ever again prompts about
renaming a column/table you didn't touch, suspect the same pattern —
check whether the migration `.sql` file mentioned in the prompt has a
matching `drizzle/meta/NNNN_snapshot.json`. If missing/stale, reconstruct it
the same way (isolated temp generate → splice `prevId` only) rather than
answering the interactive prompt, since answering wrong can emit destructive
SQL. Never hand-write a custom SQL migration without also regenerating (or
manually reconstructing) its snapshot afterward — that's what caused this in
the first place. See also [[sprint007_access_control]] if it exists — this
drift originated during that feature's work (migration 0007).
