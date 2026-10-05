# Research: Legacy Proving Ground, Credential Vault, Quality Gates and Evals

## §1 Micro-frontend composition

- **Decision**: runtime composition with ES modules. Each front-end app builds with Vite in
  library mode into one ES module that exports `mount(el, ctx)` and bundles its own React. The
  shell fetches `/mfe/import-map.json` and calls `import(url)` when a route needs an app. The
  shell and the apps talk over `window` `CustomEvent`s (`pg:cart-changed`, `pg:session-expired`).
  The mini-cart is a custom element with an open shadow root.
- **Rationale**: this matches what real estates do (separate deploys, runtime loading, duplicate
  framework copies, event buses) without Module Federation's build coupling. It needs only plain
  Vite.
- **Alternatives**: Module Federation (heavy, and its plugins change fast); single-spa (one more
  framework to learn, not needed); iframes for every app (that is LO-02's case only).

## §2 Backend shape

- **Decision**: Django 5 with no ORM models. A process-local `Store` (dicts behind a lock) is
  seeded from `seed/*.json` plus `var/users.local.json` (Django `pbkdf2_sha256` hashes).
  `POST /__admin/reset` re-seeds it. Sessions use signed cookies plus a server-side registry
  (`session_id → last_seen`), so idle timeout (`PG_SESSION_TIMEOUT_S`, default 300, 5 in gates)
  and logout are real. `launcher.py` serves the same WSGI app on two ports with
  `wsgiref`'s threading server. Port 4101 answers only `/widget/*`.
- **Rationale**: deterministic reset, nothing to migrate, offline, one process to start and stop.
- **Alternatives**: Django ORM + SQLite (migrations and a DB file inside a fixture app);
  FastAPI (the user asked for Django).

## §3 Legacy app

- **Decision**: Django templates that are deliberately bad. Bank "Historia operacji" is a
  `<frameset>` (menu + content). Layout tables carry the forms. Links are `javascript:` postbacks
  (`__doPostBack`-style hidden form with `__VIEWSTATE`). URLs carry `;jsessionid=`. One page is
  encoded in `windows-1250`. Images carry the text of the rates banner. There are duplicate ids,
  unclosed tags, and one dead link and one 500 page. The bank and insurer apps embed the legacy
  app through an iframe wrapper, which is LO-02.
- **Rationale**: these are the real shapes of old JSP, ASP.NET and PHP portals.

## §4 Fake CAPTCHA

- **Decision**: `captcha.py` renders a widget inside `<div class="g-recaptcha" data-sitekey="pg-test-key">`
  with an iframe `src="/widget/recaptcha/api2/anchor?k=pg-test-key"`, so it carries the markers
  that `CAPTCHA_MARKERS` already detects. The checkbox step leads to a 3×3 image grid. The answer
  is a set of tiles that is written only into the image pixels (generated PNG), never into the
  DOM, so clicking alone cannot pass it. The checkout and the second login attempt require the
  token the widget issues.
- **Rationale**: it exercises existing detection unchanged and can be solved only by a human.

## §5 Credential vault

- **Decision**: AES-256-GCM, a random 12-byte nonce per value, and AAD =
  `portal_id|environment|ref_name`, so a ciphertext copied to another row fails. The key is 32
  random bytes, base64, in `~/.config/pathfinder/vault.key`. The file is created on first `set`
  with mode 0600 and the parent directory with 0700. `PATHFINDER_VAULT_KEY_FILE` overrides the
  path, and tests point it to a temp file. A `key_id` (first 8 hex characters of SHA-256 of the
  key) is stored per row, so a rotated key gives the clear error "stored with key X, current key
  Y; re-enter". The values are read from a hidden TTY prompt or from stdin (`--stdin`), never
  from argv, because argv is visible in `ps` and in shell history.
- **Seed for the estate**: `vault generate` creates 24-character random passwords, stores them,
  and writes `apps/proving-ground/backend/var/users.local.json` with Django hashes
  (`pbkdf2_sha256$<iter>$<salt>$<b64>`, computed with `node:crypto.pbkdf2Sync`). That file is
  gitignored, and no plaintext touches the disk.
- **Production**: the login tool is refused on `environment: production` in this feature,
  because the production guard allows only read actions and a login submit is not one. Reading
  production behind a login needs its own constitution discussion (questions list).
- **Alternatives**: OS keyring (`libsecret` is missing on WSL, and it cannot be per-environment
  per-portal in SQL as asked); SQLCipher (encrypts the whole DB and needs a native rebuild);
  `age`/`sops` (external tools).

## §6 Server-side login and secret hygiene

- **Decision**: the portal `login` block names the login URL, the username and password controls
  (by label, with a CSS fallback because the legacy login has no labels), the submit control, and
  the success, failure and expiry signs. The `login` tool works in this order:
  1. Resolve the persona's refs from the run's resolved-secret map.
  2. Register the values with the run's redactor.
  3. `context.tracing.stop()` the current chunk and keep it.
  4. Navigate to the login URL through the gate.
  5. Fill and click with Playwright directly, bypassing autofill, the action record and the
     network body capture for this request.
  6. Restart tracing.
  7. Observe the landing page through the normal pipeline, as a navigation, with the redactor on.
  8. Return `{ outcome: 'logged_in' | 'failed', reason, state_id }`.

  The redactor is a run-scoped set of strings. `redact(text)` replaces each one with `[secret]`.
  It is applied in `pipeline.ts` before the evidence write (snapshot, title, layout names), in
  the network recorder (bodies, query), in the decision-log detail, in `scrubTraceJson` and
  `scrubTraceText`, and in a pino `formatters.log` hook. Screenshots are not redacted, because a
  browser renders a password field as dots; a portal that echoes the password is caught in text
  but still shows it in pixels. That is a known limit, and gate LO-30 checks that the estate does
  not echo it.
- **Re-login**: after every observation, the pipeline checks the expiry signs (URL pattern or
  text). If they match on a run that has logged in, it logs in once, navigates back to the target
  URL, and writes the decision-log entry `relogin`. A second expiry within the same step is
  reported as `SESSION_LOST`. Login pages that are reached this way are not recorded as process
  steps in trace mode.
- **Lockout guard**: the first `failed` outcome sets `run.login_blocked`. Every further `login` or
  re-login then returns `LOGIN_BLOCKED` without touching the portal.

## §7 CAPTCHA hand-off

- **Decision**: `request-gate.stop()` keeps stopping the run only on production. On sandbox and
  staging, a `captcha` verdict is turned into a `handoff` event: the observed state gets
  `needs_human = 'captcha'` (as a decision-log entry and an open question with the text
  `Human needed: CAPTCHA on <route template>`), the pipeline refuses actions whose target lies
  inside the widget container (`CAPTCHA_TARGET`), and the frontier goes on. `http_403`, `http_429`
  and `portal_signature` keep today's behaviour on every environment.
- **Rationale**: no schema change. Open questions are already the worklist a human reads in the
  dashboard.

## §8 Tier-1 gates

- **Decision**: `@pathfinder/gates` is a vitest project. `globalSetup` builds the web apps if
  their `dist` is older than their sources, starts the estate (`uv run proving-ground --port 4200
  --widget-port 4201 --session-timeout 20`; 5 s was too short for SSE pages, findings F-06; the
  reference portal is started by the cases that need it, not here), waits for
  `/healthz`, and tears both down at the end. Cases use the existing `startHarness` and scripted
  calls (the harness is moved to an exported test-kit in `mcp-server`). `gate(id, title, fn)`
  wraps `it` and records the id. A custom reporter writes `data/gates/report.json`.
  `coverage.test.ts` parses `docs/legacy-obstacles.md` and `eval-cases.yaml` and fails on any
  in-scope id without a case.
- **Budget**: cases target specific URLs instead of mapping whole domains. The single "map the
  shop" case is capped at 60 steps.

## §9 Tier-2 evals

- **Decision**: `pnpm eval <portal> [--persona p] [--budget-usd n] [--promote]`. It refuses to
  start while a `pathfinder` or `pathfinder-ba` MCP server process is running for that store
  (spec 008 F-09). It starts the estate if the portal is a proving-ground one, then runs these
  steps:
  1. `claude -p "<fixed crawler prompt>" --agents .claude/agents --mcp-config .mcp.json
     --output-format json --max-budget-usd n --permission-mode bypassPermissions`. The prompt
     asks the crawler subagent to map the portal as the persona.
  2. The same with the BA agent prompt (one analysis session over the new run).
  3. `docs:evaluate --json`.

  It reads `total_cost_usd`, `usage` and `duration_ms` from the CLI output. It writes the result
  JSON, compares it with the baseline (default tolerance: recall −0.05 and precision −0.05 per
  category), and exits with 1 on a regression.
- **Rationale**: it uses the agents exactly as a developer does. Nothing new is needed to run an
  LLM.
- **Risk**: CLI flags change between versions. `eval-run.ts` checks `claude --version` and fails
  with a clear message.

## §10 Ground truth v2

- **Decision**: it extends the reference portal's schema as a superset, so the reference portal's
  file stays valid. New fields: `GtScreen.actor` (`guest` | user id; default `guest`),
  `GtScreen.obstacles` (catalogue ids), a top-level `redirects` list (`from` → `to`, kind), and
  `users` (id and persona id; never passwords). The evaluator learns three new categories:
  `obstacles` (a catalogue id counts when a record cites the screen and mentions the obstacle's
  marker phrase, or when a hand-off exists for it), `logged_in_screens`, and `entry_points`.
