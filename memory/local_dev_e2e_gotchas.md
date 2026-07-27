---
name: local-dev-e2e-gotchas
description: Non-obvious environment gotchas hit while setting up local dev + live Playwright E2E self-test on Windows
metadata:
  type: feedback
---

Hit while running the Principio IX live self-test for the first time in this
environment (2026-07-26, Windows, PowerShell/Git Bash). Save time next time:

- **`pnpm` isn't on PATH** — use `corepack pnpm <cmd>` (corepack IS installed).
- **`node_modules` can be silently corrupted**: a first `pnpm install` that gets
  interrupted (e.g. by a tool timeout) can leave `@types/*` folders present but
  EMPTY, and a later plain `pnpm install` reports "Already up to date" without
  fixing it (content-addressable store shortcut skips re-verification). Fix:
  `rm -rf node_modules && pnpm install` from scratch — `--force` alone does NOT
  reliably repair it.
- **Never run `pnpm build` while `pnpm dev` is running** — both share `.next/`;
  `next build` wipes/rewrites it and the running dev server starts 404-ing on
  every route (including `/api/health`) until restarted. If a dev server seems to
  have "stopped serving anything," suspect this before anything else.
- **`TaskStop` on a background bash task may not kill the actual child `next dev`
  node process on Windows** — it can keep listening on the port. After stopping a
  dev-server task, check `netstat -ano | grep :3000` and `taskkill //PID <n> //F`
  the real node.exe if the port is still held, before starting a fresh one.
- **Playwright's cached chromium build can mismatch the installed `playwright` npm
  version** after a fresh `node_modules` install (e.g. cache has `chromium-1217`,
  package wants `1228`) — run `pnpm exec playwright install chromium` if
  `browserType.launch` reports a missing executable.
- **Never write a Playwright test script into the project directory** (even a
  `.mjs` scratch file) — Next dev's file watcher reacts to it and can trigger Fast
  Refresh / HMR at random points mid-test, silently resetting React component
  state (e.g. a controlled input's local state) or in-memory server module
  singletons (e.g. the wa-mock's in-memory outbox). Symptom: intermittent,
  unexplainable "value reverted to empty" or "outbox is empty" failures that
  disappear on retry. Fix: run the script from **outside** the watched tree via
  stdin with cwd set to the project root, so `playwright` still resolves from
  `node_modules`: `node --input-type=module < script.mjs` (cwd = project dir).
  Never `cp` the script into the project root first.
- **`page.waitForLoadState("networkidle")` never resolves on any page that opens
  an SSE/EventSource connection** (this app's `/api/events`, used app-wide, not
  just in the inbox) — it'll time out at 60s. Use a fixed short
  `waitForTimeout(~1500)` after the key selector appears instead, for hydration.
- **Chromium's native "Escape reverts to value at focus time" behavior** fires on
  a `<textarea>` too, not just `<input>`, when the keydown handler doesn't call
  `preventDefault()`. Combined with Playwright's `.fill()` (which focuses +
  sets value + dispatches input, but does NOT necessarily refresh the browser's
  internal "value snapshot at focus"), a `.fill()` right before a
  `keyboard.press("Escape")` test can revert to a stale snapshot instead of the
  filled value even though your app's `preventDefault()` logic is correct. Use
  realistic `.type()` (real keystrokes) instead of `.fill()` when a test is going
  to press Escape afterward.
- **Zombie `chrome.exe` processes accumulate fast** if a Playwright script errors
  out repeatedly across manual debugging iterations (each `chromium.launch()`
  spawns ~5-10 `chrome.exe`). 100+ stray processes cause severe, misleading
  flakiness (clicks silently not registering, state updates not flushing in time)
  that looks like app bugs but is pure resource contention. If tests get flaky for
  no code reason, run `tasklist | grep -c chrome.exe` and `taskkill //IM
  chrome.exe //F` before debugging further.
- **Registration is instance-wide, not per-email**: this app closes signup after
  the FIRST organization is created (`ALLOW_SIGNUP` gate) — a second `/register`
  attempt with a different email still fails with "cadastro está fechado." For
  repeatable local E2E runs, either `TRUNCATE TABLE "user", "organization" CASCADE`
  before each run, or use a fixed test email and fall back to `/login` when
  registration is rejected.
- **Disable the AI agent for unrelated E2E tests**: leaving `OPENROUTER_API_TOKEN`
  set means every inbound message triggers a real async agent turn after
  `AGENT_COALESCE_MS` (default 6000ms) that sends its own outbound message,
  racing with and polluting assertions about your own explicit sends (e.g. an
  "outbox" check racing the agent's own auto-reply). Comment out
  `OPENROUTER_API_TOKEN`/`OPENROUTER_BASE_URL` in `.env` when testing something
  unrelated to the agent — the product runs fine as a CRM without them.
- **A freshly created conversation (via manual "start conversation by phone", no
  inbound message ever received) has `windowOpen: false` by design** on the
  official channel — the composer correctly shows the template-only fallback UI,
  not a free-text textarea. This is correct behavior mirroring the real WhatsApp
  24h rule, not a bug — don't assert a textarea appears right after creating a
  contact this way.

- **Every `page.goto()` is a hard navigation that re-triggers hydration** — even
  to a route already visited earlier in the same script/page session. Clicking
  immediately after a `goto()` + `waitForSelector()` (the selector only proves
  the SSR HTML arrived, not that React attached event handlers yet) is a
  recurring source of "click did nothing" flakiness throughout a long E2E
  script, not just on the very first visit. Add a short settle wait (~2-3s)
  after every `goto()`+selector-wait pair before the first interaction, not
  only on the script's first page load.
- **Vitest's default file-parallelism is genuinely resource-sensitive on this
  machine** when Docker Desktop is also running (its background VM/hypervisor
  competes for CPU) — 2 specific pre-existing tests
  (`tests/unit/lab-sandbox.test.ts`, `tests/unit/send-sandbox.test.ts`) can
  consistently hit their 5000ms timeout under `pnpm test`'s default parallel
  run while Docker is up, yet pass in under 3s in isolation or with
  `vitest run --no-file-parallelism`. Before concluding a test regression,
  re-run with `--no-file-parallelism` — if that's 100% green, it's environment
  contention, not a code defect.

See also [[project-roadmap-vs-reality]] for what was actually being tested.
