# Implementation Plan: Legacy Proving Ground, Credential Vault, Quality Gates and Evals

**Branch**: `feature/009-r25-r27-legacy-proving-ground` | **Date**: 2026-10-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-legacy-proving-ground/spec.md`

## Summary

**R-25.** A new app, `apps/proving-ground`, holds a Django backend (uv) and a pnpm workspace of
React front-end apps built with Vite. The **shell** is a React single-page app that reads an
import map of micro-frontend URLs at runtime and mounts the **shop**, **bank** and **insurer**
apps, each built on its own with its own React copy and the contract
`mount(element, context) → unmount`. Every modern text comes from CMS JSON files
(`cms/<domain>/<lang>.json`) that the backend serves with an artificial delay. The backend also
serves a **legacy** server-rendered app (Django templates written as 2005-era HTML: frames, layout
tables, `windows-1250`, postback links, `;jsessionid=`). The bank and insurer shells embed it in an
iframe (the wrapper). A second port serves a cross-origin claim-upload widget. State lives in one
process-local store that is seeded from JSON and restored by `POST /__admin/reset`, so no database
file churns. A fake CAPTCHA widget (`g-recaptcha` markers, a checkbox step and then an image
step) guards shop checkout and login after a failed attempt. Each domain has its own portal
config, personas and ground-truth JSON in the extended `ground-truth` shape. A self-check
validates them against the running estate. `docs/legacy-obstacles.md` maps each catalogue id to a
place in the estate.

**R-26.** A new pure-ish package, `@pathfinder/vault`, encrypts credentials with AES-256-GCM
(`node:crypto`). The key file lives outside the repo (`~/.config/pathfinder/vault.key`, mode
0600, overridable with `PATHFINDER_VAULT_KEY_FILE`). Ciphertexts go in the per-environment
database (migration `0007_credentials`). A `pnpm vault` CLI sets, lists, deletes and generates
credentials, and writes the proving ground's user seed as Django password hashes, never as
plaintext. `start_run` resolves every `ref:` of the persona or refuses the run. A new agent tool,
`login`, has the server fill the form described by the portal's `login` block with Playwright
locators, outside the action pipeline. During login, Playwright tracing is paused and every
resolved value is registered with a run-scoped **secret redactor**. The redactor is applied at
every write path (evidence snapshot and title, network bodies, decision log, trace spans, pino
logs, tool results). The pipeline checks each observed page against the portal's expiry signs,
logs in again once, and returns to the target. A failed login disables further logins for that
run. On sandbox and staging, a detected CAPTCHA no longer stops the run. The state is recorded
with `needs_human`, a hand-off open question is created, actions on the widget are refused, and
the frontier goes on. Production behaviour does not change.

**R-27.** A new vitest project, `apps/crawler/packages/gates`. Its global setup starts the
estate and the reference portal on test ports (building the front-end apps first if they are
stale). Each test file registers gate cases with `gate('LO-13', …)` / `gate('F-10@004', …)` and
drives the crawler server through the existing in-memory MCP harness with scripted calls. A
coverage test reads the catalogue and `gates/eval-cases.yaml` (each finding id → `gate`, `eval`
or `not_testable` with a reason) and fails when an in-scope id has no case. A reporter writes
`data/gates/report.json`. Tier 2 is `pnpm eval <portal>`
(`apps/crawler/scripts/eval-run.ts`). It refuses to start while stale servers are running,
starts the estate, and runs `claude -p` headless twice, first with the crawler agent and then
with the BA agent (fixed prompts, `--output-format json`, `--max-budget-usd`). It then runs the
extended evaluator, writes `data/evals/<portal>/<timestamp>.json`, and compares the result with
`baseline.json` using per-category tolerances. `--promote` moves the baseline to `history/`.

## Technical Context

**Language/Version**: TypeScript (Node 22/24, ESM) in `apps/crawler` and the proving-ground web
workspace. Python 3.12 for the proving-ground backend.

**Primary Dependencies**: Django 5.x (no ORM models; `SESSION_ENGINE` signed cookies plus a
server-side session registry for timeouts), React 19, Vite. Existing: Playwright, the MCP SDK,
Zod, Kysely/better-sqlite3. No new crypto dependency (`node:crypto` AES-GCM and PBKDF2 for the
Django hash format).

**Storage**: SQLite `data/db/<env>.sqlite`, new migration `0007_credentials` (table
`credentials`). The proving ground keeps its state in memory, seeded from committed JSON plus a
gitignored `apps/proving-ground/backend/var/users.local.json` (password hashes only). Eval results
are JSON files under `data/evals/`.

**Testing**: Vitest (crawler workspace, new `gates` project), pytest for the backend (views,
store, reset, redirects, lockout, timeout), and a ground-truth self-check (Vitest, against the
running estate).

**Target Platform**: Local Linux/WSL developer machine, Chromium via Playwright.

**Project Type**: a web estate (test fixture app), libraries and CLIs.

**Performance Goals**: estate up in under 60 s from cold (build cached); gate suite under 3 min
added to `pnpm test`.

**Constraints**: offline after install; no third-party requests from the estate; no plaintext
password on disk outside the user's key file and the vault's memory; fixed ports 4100 (estate)
and 4101 (cross-origin widget). Gates use 4200/4201 so they never fight a developer's running
estate.

**Scale/Scope**: about 51 catalogue entries (49 in scope), 3 domains with about 15–20 screens each,
3 test users per domain.

## Constitution Check

| Principle | Check | Result |
|---|---|---|
| I Observed vs intent | Login and hand-off record facts (`logged_in`, `needs_human`); obstacles are documented by the BA, not the crawler | Pass |
| II Evidence | Hand-offs and re-logins are decision-log entries with evidence; ground truth links catalogue ids | Pass |
| III Role separation | `login` is a crawler tool; the agent never sees values; the BA still never browses; evals only orchestrate | Pass |
| IV Replay verification | Not affected | Pass |
| V Safety | Estate is `sandbox`. CAPTCHA is never solved (hand-off). Production still stops on a block. Secrets by reference only, now resolved server-side. Login submit is `external-side-effect` on sandbox only; on production the login tool is refused unless the portal declares a login and the persona allows it (read-only login is out of scope, see research §5) | Pass |
| VI Human in loop | Hand-off items are open questions for a human | Pass |
| VII Deterministic core | Vault crypto, redactor, catalogue/coverage parsing and eval comparison are pure and unit-tested; the gate tier has no LLM | Pass |
| Tech constraints | Persona `ref:` rule kept; Zod for the new config blocks and eval result; SQLite for credentials (one table, no second store) | Pass |
| Workflow | Mutating exploration only against our own sandbox estate | Pass |

Post-design re-check: still passes. The new agent tool changes the crawler agent's tool list,
`AGENT_TOOL_NAMES` and `.claude/agents/crawler.md`. This is a propagation step, not a principle
change, so no amendment is needed.

## Project Structure

### Documentation (this feature)

```text
specs/009-legacy-proving-ground/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md
├── findings.md            # bugs and slips found while building (log-every-bug rule)
├── contracts/
│   ├── estate.md          # ports, routes, reset, CMS, users, micro-frontend contract
│   ├── ground-truth-v2.md # extended ground truth
│   ├── vault-cli.md       # pnpm vault commands
│   ├── login-tool.md      # portal `login` block, persona auth, `login` tool, re-login, hand-off
│   └── gates-evals.md     # gate case API, eval-cases.yaml, pnpm eval, result/baseline JSON
└── checklists/requirements.md
docs/legacy-obstacles.md   # living catalogue (FR-013)
```

### Source Code

```text
apps/proving-ground/
├── README.md
├── package.json, pnpm-workspace.yaml     # web workspace
├── web/
│   ├── shell/          # React SPA: import map, routes /sklep /bank /ubezpieczenia, cookie MFE, mini-cart web component
│   ├── mfe-shop/       # React, generated class names, div buttons, GraphQL-like endpoint
│   ├── mfe-bank/       # React, transfer form, statements, legacy iframe wrapper, ticker (SSE)
│   └── mfe-insurer/    # React, hash routing, policies, add-ons, claim wizard
├── cms/{shop,bank,insurer,shell}/pl.json
├── backend/
│   ├── pyproject.toml, uv.lock
│   ├── src/proving_ground/
│   │   ├── settings.py, urls.py, launcher.py   # two ports, one WSGI app
│   │   ├── store.py, seed/*.json               # in-memory state + reset
│   │   ├── auth.py                             # login, lockout, session registry, timeout
│   │   ├── api/{shop,bank,insurer}.py          # JSON / GraphQL-like / SSE
│   │   ├── legacy/views.py, templates/legacy/  # frames, tables, cp1250, postback, jsessionid
│   │   ├── captcha.py                          # fake widget (checkbox + image)
│   │   └── redirects.py                        # chains, meta refresh, old URL scheme
│   └── tests/
├── ground-truth/{shop,bank,insurer}.json
└── scripts/start.mjs   # build-if-stale + launch

apps/crawler/packages/
├── vault/              # NEW: crypto, store, resolver, redactor, CLI
├── gates/              # NEW: vitest project, estate setup, cases, coverage, eval-cases.yaml
├── config/             # portal `login` + `expiry` block, persona auth shape
├── core/               # credential table types, redactor hook in log/trace scrub
├── mcp-server/         # login tool, ref resolution in start_run, re-login, captcha hand-off
├── safety/             # block verdict → hand-off on non-production
└── docs/               # evaluator: obstacles, actor, redirects
apps/crawler/scripts/vault.ts, eval-run.ts, eval-compare.ts
portals/proving-ground-{shop,bank,insurer}/portal.yaml
personas/proving-ground-{shop,bank,insurer}/{guest,client}.yaml
data/migrations/0007_credentials.{up,down}.sql
```

**Structure Decision**: one new app under `apps/` (CLAUDE.md), with its Python backend and its
web workspace kept self-contained like `apps/dashboard` and `apps/crawler`. The crawler-side work
goes into the existing packages, plus two new packages there.

## Complexity Tracking

| Choice | Why needed | Simpler alternative rejected because |
|---|---|---|
| Four separately built front-end apps | Micro-frontend obstacles (LO-01, LO-05, LO-34) need real separate bundles | One React app with folders would not reproduce runtime composition or cross-app state |
| Second port | LO-03 cross-origin iframe | Same-origin iframes do not show the cross-origin limits |
| In-memory store instead of Django ORM | Deterministic reset, no DB file churn, no migrations in a test fixture | ORM + SQLite needs migrations and leaves a file to commit or ignore |
| New `login` tool | The agent must never hold the password, so `act` with a value cannot be used | Filling through `act` puts the value in the agent context, the action record and the trace |
