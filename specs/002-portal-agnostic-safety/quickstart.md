# Quickstart: Validating Portal-Agnostic Safety and Portal Workspaces

Proves spec 002 end to end. Assumes spec 001's quickstart prerequisites (Node 22+, pnpm,
`pnpm --dir apps/crawler install`, a working Chromium). Commands run from the repo root.

## 1. Unit suites (FR-002, FR-010 to FR-017, FR-025; SC-002, SC-005, SC-006)

```bash
pnpm --dir apps/crawler test
```

- **Expect**: all spec 001 tests still pass; the robots fixtures (liveinsurer.example, marketsite.example,
  forum.example, pl.wikipedia.org, classifieds.example, RFC 9309 examples) give the expected verdicts, including
  every liveinsurer `cHash` campaign URL in the 50-URL sample (SC-002); the spec 001 labelled actions
  keep their classes (SC-005); every invalid portal rule and cross-portal `extends` in the test
  set fails with the file and rule named (SC-006, SC-009).

## 2. Robots on the insurer mock (User Story 1; SC-001)

Run the integration file for the insurer mock (5 consecutive map runs):

```bash
pnpm --dir apps/crawler exec vitest run packages/mcp-server/tests/insurer-run.test.ts
```

- **Expect**: 0 requests in the mock's log to `*cHash*`, `/quote/summary` or `/api/` (with the
  default `robots_page_requests: block`); `/quote/start` visited; each skipped link is a frontier
  item `robots_disallowed` with its `robots:` rule; the `/api/` calls appear as decision-log
  `note` entries; the run's config snapshot holds the robots policy and its evidence reference.
- Repeat with the mock portal file set to `robots_page_requests: allow_and_record`: `/api/` is
  requested and still recorded as a `note`; navigations to disallowed URLs stay refused.

## 3. Robots failures (FR-004; SC-003)

The same test file runs the mock with `robots.txt` answering 404, 503 and a redirect loop.

- **Expect**: 404 → run proceeds, policy `no_rules`; 503 and redirect loop → `start_run` returns
  `ROBOTS_UNAVAILABLE` in under 5 s and the mock logged only `robots.txt` requests.

## 4. Configuration only (User Story 3; SC-004, SC-007)

- The insurer mock is mapped from `portals/<mock>/portal.yaml` and `personas/<mock>/guest.yaml`
  created by the test; no source file mentions it.
- **Expect**: "Kup polisę" refused under `purchase`, "Wyślij zapytanie" under `submit_request`,
  "Przedłuż polisę" under the portal rule `renew_policy`; the quote form's fields are recorded,
  never submitted.
- Search for portal ids and domains in code:

```bash
grep -rniE "liveinsurer|marketsite|lokalnie|classifieds|forum" apps/crawler/packages/*/src .claude/agents
```

  **Expect**: no matches (SC-007).

## 5. Workspaces, export and delete (User Story 5; SC-008, SC-009)

Map both mock portals into one sandbox DB (the integration test does this), then:

```bash
pnpm --dir apps/crawler portal:export mock --env sandbox --operator "qa"
pnpm --dir apps/crawler portal:delete mock --env sandbox --operator "qa"          # dry run
pnpm --dir apps/crawler portal:delete mock --env sandbox --operator "qa" --yes
```

- **Expect**: the export folder holds only the marketplace mock's rows and evidence; the dry run
  lists counts and shared evidence it would keep; after the delete, 0 rows of that portal
  remain, the insurer mock's rows and evidence are byte-identical to before, and
  `portal_data_log` has an `export` and a `delete` row naming `qa`.
- Identical pages on the two mocks (the shared cookie page) are two states, one per portal.

## 6. Live check on liveinsurer.example (after T072 sign-off in spec 001)

Ask the main session: "Use the crawler subagent to map `liveinsurer` as `guest`".

- **Expect**: the run's robots policy for `www.liveinsurer.example` has `outcome = rules`; no request in the
  run touches a `robots.txt`-disallowed URL (checked from the decision log and the network
  shapes); `cHash` menu links appear in the frontier report as `robots_disallowed`.

## Validation notes (2026-09-25, branch `feature/002-r11-portal-agnostic-safety`)

Run with Chromium libraries from the session scratchpad (`LD_LIBRARY_PATH`, see the 2026-09-24
session dump); without them the browser suites skip.

| Section | Where it is checked | Result |
|---|---|---|
| §1 Unit suites | `pnpm --dir apps/crawler test` (44 files) | 612/612 pass; `typecheck` and `lint` clean. `crawler/tests/stabilizer.test.ts` "finite CSS animation" failed once under full-suite load and passed 3/3 alone (timing-based, unchanged by this feature) |
| §1 SC-002 | `safety/tests/robots.test.ts` on `tests/fixtures/urls/liveinsurer-robots-sample.json` | 50/50 URLs match the manual reading, all 9 `cHash` links refused |
| §2 SC-001 | `mcp-server/tests/insurer-run.test.ts` | 5 consecutive runs, 0 requests to `*cHash*`, `/quote/` (except `/quote/start`) or `/api/`; `allow_and_record` variant passes |
| §3 SC-003 | same file | 404 → `no_rules`; 503 and redirect loop → `ROBOTS_UNAVAILABLE` well under 5 s, only robots.txt requested, no run row |
| §4 SC-004, SC-007 | same file (portal and persona written by the test); `mcp-server/tests/no-portal-names.test.ts` | insurer mapped with YAML only; no portal id or domain in `packages/*/src` or `.claude/agents` |
| §5 SC-008, SC-009 | `mcp-server/tests/workspaces.test.ts`, `core/tests/portal-data.test.ts` | identical cookie page = two states; export holds one portal only; delete leaves the other portal byte-identical and resumable; CLIs smoke-tested on a scratch root (exit 1 without runs, dry run without `--yes`) |
| §6 live liveinsurer | not run | waits for spec 001 T072 (compliance sign-off by the user) |
