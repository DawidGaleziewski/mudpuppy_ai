# Tasks: Legacy Proving Ground, Credential Vault, Quality Gates and Evals

**Input**: Design documents from `specs/009-legacy-proving-ground/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: included. Vitest for the TS packages, pytest for the backend, and the gates themselves.

**Model tags**: `[opus]` = design-heavy or subtle (session/lockout logic, captcha, shell
composition, crypto, redaction, login/re-login, hand-off, gate harness, evaluator); `[sonnet]` =
mechanical (scaffolds, CMS texts, screens built to the contract, ground-truth JSON, configs, docs).

Paths: `PG/` = `apps/proving-ground/`, `CR/` = `apps/crawler/packages/`.

## Format: `[ID] [P?] [Story] [model] Description`

---

## Phase 1: Setup (R-25)

- [X] T001 [sonnet] Use the governor agent to scaffold `PG/`: `README.md`, `package.json` + `pnpm-workspace.yaml` (`web/*`), `backend/pyproject.toml` (uv, Django 5, pytest, ruff; script `proving-ground = proving_ground.launcher:main`), `.gitignore` for `backend/var/`, `web/*/dist/`, `node_modules/`.
- [X] T002 [sonnet] Web workspace: `web/{shell,mfe-shop,mfe-bank,mfe-insurer,mfe-cookies}` with Vite library-mode builds to one ES module each (`mount(el, ctx)`), React 19, CSS modules with hashed names (`generateScopedName` 8-char hash), shared `tsconfig.base.json`, `typecheck` and `build` scripts.

## Phase 2: Foundational backend + shell (R-25, blocks every story)

- [X] T003 [opus] `backend/src/proving_ground/{settings,urls,launcher,store}.py`: Django without ORM, the in-memory `Store` seeded from `seed/*.json` + the users file, `POST /__admin/reset`, `/healthz`, `/robots.txt`, `/api/clock`, launcher serving one WSGI app on two ports (widget port answers `/widget/*` only), flags per contracts/estate.md; pytest.
- [X] T004 [opus] `auth.py`: login page data, CSRF, `POST /api/login` / logout, lockout after 3 failures, CAPTCHA required after the first failure, session registry with idle timeout, 401 for API and 302 for page loads after expiry, `/api/session`; pytest.
- [X] T005 [opus] `captcha.py`: fake widget (`g-recaptcha` container, iframe on the widget port, checkbox → 3×3 image grid PNG whose answer is only in pixels), token issue/verify; pytest.
- [X] T006 [P] [sonnet] CMS: `PG/cms/{shell,shop,bank,insurer}/pl.json`, `/cms/<domain>/pl.json` with `--cms-delay-ms`, `/mfe/import-map.json`, static serving of `web/*/dist` under `/mfe/<name>/`.
- [X] T007 [opus] Shell (`web/shell`): import-map loader + `mount` contract + error area, routes `/`, `/sklep*`, `/bank*`, `/ubezpieczenia*`, `/logowanie` (white-label login from CMS), `pg:*` event bus, `<mk-mini-cart>` custom element with shadow root, session-expired modal, cookie app overlay, Console design tokens; utility-soup class names.

**Checkpoint**: `uv run pytest`, `pnpm -r build`; commit (T001–T007).

## Phase 3: US1 – Start the estate and browse three domains (P1, R-25)

- [X] T008 [P] [US1] [sonnet] Shop API (`api/shop.py`): GraphQL-like `POST /api/shop/graphql` (`Catalog`, `Product`, `AddToCart`, `Cart`, `UpdateCart`, `PlaceOrder` with CAPTCHA token), `GET /api/shop/lockers`, seed products (≥ 30, 4 categories); pytest for rules (free delivery ≥ 200 zł, quantity 1–10, postal code, locker required).
- [X] T009 [US1] [sonnet] `web/mfe-shop`: screens and obstacles per contracts/estate.md Shop table (div buttons, icon-only toggle, custom dropdown, A/B banner, newsletter modal, endless pagination, missing CMS key, cascading lockers, CAPTCHA before submit, account page).
- [X] T010 [P] [US1] [sonnet] Bank API (`api/bank.py`): accounts, transfer validation (IBAN checksum, amount range with decimal comma, title ≤ 140, daily limit, after-22:00 booking), statements by month, PDF download, SSE ticker; pytest.
- [X] T011 [US1] [sonnet] `web/mfe-bank`: landing (image banner, chat iframe), pulpit with ticker, transfer form (placeholder-only inputs, div `Wykonaj`), confirmation, statements, Historia wrapper iframe.
- [X] T012 [P] [US1] [sonnet] Insurer API (`api/insurer.py`): policies, add-ons with the 50 000 zł rule, claim wizard with server-held state and Back reset, server-side 30-day date rule, policy PDF, upload endpoint on the widget port; pytest.
- [X] T013 [US1] [sonnet] `web/mfe-insurer`: hash routing, popup OWU, never-settling comparison spinner, policy list/detail, add-ons with custom date picker, claim wizard with cross-origin upload iframe.
- [X] T014 [P] [US1] [sonnet] Legacy app (`legacy/views.py`, `templates/legacy/`): frameset, postback menu with `__VIEWSTATE`, layout tables, duplicate ids, invalid HTML, cp1250 page, 404 and 500 pages, `;jsessionid=` URLs, classic POST + redirect claim form; pytest for encoding and status codes.
- [X] T015 [P] [US1] [sonnet] `redirects.py` (301→302 chain, meta refresh, JS `location.replace`) and rate-limit middleware (30 req/s per session → 429 `Retry-After: 1`); pytest.
- [X] T016 [US1] [opus] `PG/scripts/start.mjs` (build stale apps, then `uv run proving-ground`), `start`/`build`/`gt:check` scripts, README; Playwright smoke script walking quickstart R-25 steps 2–5.

**Checkpoint**: smoke script passes; commit (T008–T016).

## Phase 4: US2 – Catalogued obstacles with ground truth (P1, R-25)

- [X] T017 [US2] [opus] Ground truth v2 in `CR/reference-portal/src/ground-truth.ts` per contracts/ground-truth-v2.md (`actor`, `obstacles`, `users`, `redirects`, top-level `obstacles`; superRefine rules); reference file still valid; tests.
- [X] T018 [US2] [sonnet] `PG/ground-truth/{shop,bank,insurer}.json` from the contract and the built estate (screens, forms, fields, rules with claim markers, processes, terms, obstacles, redirects, users).
- [X] T019 [US2] [opus] Self-check (Playwright, logs in as each actor with seed-fixture users), five checks of contracts/ground-truth-v2.md. As built: `CR/gates/tests/ground-truth.test.ts`, run with `pnpm gt:check` in apps/crawler (the proving-ground workspace has no Playwright); obstacle markers are written for BA records, so check 4 is "every obstacle id is in scope in the catalogue".
- [X] T020 [P] [US2] [sonnet] `portals/proving-ground-{shop,bank,insurer}/portal.yaml` (sandbox, scope, denylist `/__admin/*`, obstacles for cookie banner, newsletter modal, chat; `login` block for all three) and `personas/proving-ground-*/{guest,client}.yaml` (`client` with `ref:` auth).
- [X] T021 [US2] [sonnet] `docs/legacy-obstacles.md`: make every "Proving ground" cell name the exact route/screen id; add LO ids to ground truth `obstacles`.

**Checkpoint**: `gt:check` ok on all domains; commit (T017–T021). R-25 done pending review.

## Phase 5: US3 – Credential vault (P1, R-26)

- [X] T022 [US3] [sonnet] Use the db-admin agent: migration `data/migrations/0007_credentials.{up,down}.sql` per data-model.md, `CR/core/src/db-types.ts`, `data/schema/schema.sql`, `data/README.md`.
- [X] T023 [US3] [opus] Package `CR/vault`: `loadKey`, `encrypt`/`decrypt` (AES-256-GCM, AAD), `createVaultStore`, `resolvePersonaRefs`, `createRedactor`, `djangoPbkdf2`, `generatePassword`; tests (round trip, tamper, wrong AAD, wrong key id, redactor encodings).
- [X] T024 [US3] [opus] CLI `apps/crawler/scripts/vault.ts` + `pnpm vault` per contracts/vault-cli.md (hidden prompt, `--stdin`, never argv values; seed-file upsert); tests with a temp key file.
- [X] T025 [US3] [sonnet] Backend reads `var/users.local.json` or `--seed-users`; `backend/tests/fixtures/users.json` with `test-password-not-real`; pytest that Django `check_password` accepts the Node `djangoPbkdf2` hash (fixture produced by the TS test).

## Phase 6: US4 – Logged-in crawling (P2, R-26)

- [X] T026 [US4] [sonnet] `CR/config`: portal `login` block (Zod), effective config, persona-with-refs-needs-login check; tests.
- [X] T027 [US4] [opus] `start_run`: resolve refs through the vault (`CONFIG_INVALID` naming missing refs, before the browser), `RunState.secrets` + redactor + login status; tests.
- [X] T028 [US4] [opus] Redactor at every write path: evidence snapshot/title/layout names, network bodies and query, decision-log detail, trace spans (`scrubTraceJson`/`scrubTraceText`), pino hook, tool results; test with a page that echoes the password.
- [X] T029 [US4] [opus] `login` agent tool: tracing pause, locator resolution (label → placeholder → css), submit, outcome by signs, decision `login`, lockout guard, production refusal; add to `AGENT_TOOL_NAMES`, `.claude/agents/crawler.md` tools and instructions; tests on the estate.
- [X] T030 [US4] [opus] Re-login on expiry in the pipeline (once per expiry, back to target, decision `relogin`, `SESSION_LOST`); trace mode does not record the login page as a step; tests with a 5 s timeout.

## Phase 7: US5 – CAPTCHA hand-off (P2, R-26)

- [X] T031 [US5] [opus] Non-production CAPTCHA verdict → hand-off (state recorded, decision `handoff`, open question, actions inside the widget `allowed: false, skip_reason: captcha_handoff`, frontier continues); production unchanged; tests on the estate checkout and on a production-flagged copy.
- [X] T032 [US5] [sonnet] Crawler agent instructions and `ba-practice` skill: what a hand-off and a re-login mean; glossary entries `hand-off`, `credential vault`, `re-login`, `legacy obstacle`, `proving ground`, `gate case`, `eval baseline`.

**Checkpoint**: `pnpm typecheck && pnpm lint && pnpm test`; commit (T022–T032). R-26 done pending review.

## Phase 8: US6 – Tier-1 quality gate (P1, R-27)

- [X] T033 [US6] [sonnet] Package `CR/gates` (vitest project), export the MCP test harness from `CR/mcp-server` as a test-kit (`startHarness`, `crawl`, `mapPortal`).
- [X] T034 [US6] [opus] `globalSetup` (build-if-stale, estate on 4200/4201 with short timeouts and fixture users, reference portal on 4210, vault rows with temp key), `gate()` helper, reporter → `data/gates/report.json`.
- [X] T035 [US6] [opus] `gates/src/catalogue.ts` (parse the catalogue tables), `eval-cases.yaml` loader, `coverage.test.ts` (in-scope LO ids and `gate` findings need a case; every finding heading appears once in the index); tests for the parser.
- [X] T036 [US6] [sonnet] `eval-cases.yaml`: every finding of spec 004 `goal-run-findings.md` and spec 008 `findings.md` → `gate` / `eval` (with a check name) / `not_testable` (reason).
- [X] T037 [US6] [opus] Gate cases LO-01..LO-20 (architecture, markup).
- [X] T038 [US6] [opus] Gate cases LO-21..LO-51 (navigation, session, bot checks, network, data), including SC-003 secret search after a logged-in run.
- [X] T039 [US6] [opus] Gate cases for findings mapped `gate`.

**Checkpoint**: full `pnpm test` within budget (+≤ 3 min); sabotage check (quickstart R-27 step 2); commit (T033–T039).

## Phase 9: US7 – Tier-2 eval (P2, R-27)

- [X] T040 [US7] [opus] Evaluator categories `obstacles`, `logged_in_screens`, `entry_points` in `CR/docs/src/evaluate.ts` + input loader (hand-off open questions); tests; reference golden unchanged.
- [X] T041 [US7] [opus] `EvalResult` Zod schema, `compareEval(result, baseline, tolerances)` pure function + Markdown table; tests.
- [X] T042 [US7] [opus] `apps/crawler/scripts/eval-run.ts` + `pnpm eval`: preflight (CLI version, stale servers, estate), crawler and BA headless runs with fixed prompts, evaluate, write result, compare, `--promote`, `--dry-run`.
- [X] T043 [US7] [opus] Run the eval once per portal (`reference-insurer`, `proving-ground-shop`, `-bank`, `-insurer`) at $8 per agent, promote the first baselines, log every problem in findings.md. (Moved to R-29 at close-out: the first attempt was stopped on the user's request, F-17; no baseline promoted yet. Done in R-29, 2026-10-09: four baselines and second runs, SC-003/SC-007 met, SC-004/SC-005 not met — `specs/014-eval-baselines/criteria.md`; gap ranking in `gap-ranking.md`.)

## Phase 10: Polish

- [X] T044 [sonnet] Docs: root README (proving ground, vault, gates, eval), `portals/README.md` (`login` block), `data/README.md` (credentials, evals, gates report), CLAUDE.md verification line mentions the gates.
- [X] T045 [opus] speckit-analyze over spec/plan/tasks; resolve findings.
- [X] T048 [opus] Slow gates: `gate()`/`gap()` take `slow: true`; LO-32 and LO-35 are slow and skipped by `pnpm test`; `pnpm test:slow` runs the whole gate set with them (SC-006).
- [X] T049 [opus] Masked Playwright trace for credential runs (FR-019a): no trace capture around the login fill/submit, the trace on otherwise; a gate that searches the run's trace zips for the test password. (As built: plus a redaction pass over every saved chunk, F-15.)
- [X] T050 [sonnet] Roadmap: new crawler-hardening item from the 20 known gaps (order from the user's rating), note on owner-provided CAPTCHA bypass, note on a constitution discussion for production login. (R-28 and the notes added; its order comes with T051 in R-29.)
- [X] T051 [opus] Rating page for the 20 known gaps; fold the ranking into the new roadmap item. (Page published; folding the ranking moved to R-29.)
- [X] T046 [sonnet] Session dump and findings.md upkeep (continuous).
- [X] T047 User review and sign-off of R-25, R-26, R-27 (SC-001..SC-007). (Signed off 2026-10-05 as built, with T043/T051 leftovers moved to R-29; SC-007 open there.)

## Dependencies

- Phase 2 blocks Phases 3–4. T017 blocks T018/T019. T020 needs T026 (login block schema) to validate. Move T026 earlier if needed.
- Phase 5 blocks Phase 6. T023 blocks T024, T025, T027, T028.
- Phase 7 needs T005 (widget) and the shop checkout (T009).
- Phase 8 needs R-25 and R-26. Phase 9 needs Phase 8's harness and T017.
- Parallel: T006 with T003–T005; T008/T010/T012/T014/T015 together (backend, different files); T009/T011/T013 after T007.
