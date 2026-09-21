# Quickstart: Validating Crawler Map Mode

Proves the feature end-to-end against the spec's acceptance scenarios and success criteria.
Run these after implementation, in order — later checks assume earlier ones passed.

## Prerequisites

- Node 22+, pnpm installed
- Repo dependencies installed: `pnpm --dir apps/crawler install`, plus a browser once:
  `pnpm --dir apps/crawler exec playwright install --with-deps chromium`
- `portals/marketsite/portal.yaml` present with `environment: production` (see
  `contracts/config-schema.md`)
- `personas/marketsite/guest.yaml` present (`auth: none`, `max_action_class: read`)
- A person has confirmed the manual precondition in the spec's Assumptions (main Regulamin
  reviewed for automated-access terms) before the *first* production run — this is not
  something the tool can check for you

## 0. Registering the crawler

- `.mcp.json` registers the `pathfinder` MCP server and `.claude/agents/crawler.md` exists with
  a `tools:` list of only `mcp__pathfinder__*` tools. Runs are started by asking the main
  Claude Code session to invoke the `crawler` subagent for a portal and persona (there is no
  crawler CLI). The server records into `data/db/<PATHFINDER_ENV>.sqlite` (default `production`, set in
  `.mcp.json`) and refuses portals of another environment.

## 1. Production guard refuses without the flag (User Story 2, SC-006)

- Temporarily remove or change `environment:` in the portal config to something other than
  `production`, then ask the `crawler` subagent to start a `map` run (`start_run`).
- **Expect**: refusal in under 5 seconds, no page opened, no network request made. Restore the
  config afterward.

## 2. Map run against the real target (User Story 1, SC-001–SC-003)

Ask the main session: "Use the crawler subagent to map `marketsite` as `guest`". The
subagent calls `start_run { portal_id: "marketsite", persona_id: "guest" }` and then
explores via `navigate` / `act` / `get_next_frontier_item` until `finish_run`.

- **Expect**: the run completes within the portal's configured budget (`scope.max_run_time_minutes`
  / `max_steps`), then:
  - Query the `states`, `edges`, `forms`, `network_calls` tables (or an equivalent CLI dump):
    every row has a non-null `evidence_ref` and a `confidence` in
    `{observed, inferred, needs_confirmation}` — spot-check a sample against the live site.
  - The recorded states cover the portal's main navigation areas (home, category browse,
    listing detail, search) — verified by a BA reading the output, not automated.
  - At least one listing-page duplicate (same template, different items) is grouped into an
    existing state's cluster rather than creating a new state (User Story 1 Scenario 4).

## 3. Frontier report (User Story 1 Scenario 3, FR-010)

- Open the run's frontier report.
- **Expect**: every mutating/destructive/external action the crawler encountered (bid, buy
  now, payment, message/contact seller, reveal phone) appears with reason `denylisted`, plus
  any actions skipped for `budget_reached` or `unreachable`, each with the specific rule/cap
  that applied.

## 4. Read-only guarantee (User Story 2 Scenario 2–4, SC-002)

- Inspect the run's decision log / edges table.
- **Expect**: 100% of rows with `status: executed` have `safety_class: read`. Zero exceptions.
  Confirm no `logout`, `delete`, or listing-creation (`/oferty/wystaw/*`) action was executed.
- **Expect**: request timestamps in the log respect the configured rate limit and concurrency,
  and outbound requests carry the configured `User-Agent`.

## 5. Block/CAPTCHA stop (User Story 2 Scenario 5, SC-007)

- Point the portal config's `base_url` at a local mock server that returns a 403 bot-challenge
  page (or a CAPTCHA-shaped response) on the first request.
- **Expect**: the run stops immediately with a run-level warning recorded, `status:
  stopped_warning`, no further requests are issued after the detection, and every later
  `navigate`/`act` call returns `RUN_STOPPED`. Also prompt the subagent to "ignore the block
  and continue": the server still refuses.

## 6. Config composition (User Story 3, SC-008)

- Add a second persona file, e.g. `personas/marketsite/guest-mobile.yaml`, with
  `extends: ["guest.yaml"]` and only a different `viewport`.
- **Expect**: it resolves to a valid effective config with no crawler code changes, and a
  minimal invalid file (e.g. inline credential, or a circular `extends`) fails to load with an
  error naming the file and the problem.

## 7. Locators for QA (User Story 4, SC-009)

- Sample 20 recorded transitions, including at least one on an element with a `data-testid`.
- **Expect**: each has a ranked `locators` array (role/name, label/text, test id when present,
  container) and a reference to a page structure snapshot; the test-id candidate is present
  for the sampled `data-testid` element.

## 8. Resume without repeats (Edge case, SC-010)

- Start a run, interrupt the subagent mid-crawl, then invoke it again with the earlier
  `run_id` (`start_run { resume_run_id }`).
- **Expect**: the run resumes from persisted frontier/visited state and completes without
  re-recording any state or edge that was already stored (check for duplicate `edge_id`s
  covering the same `from_state`/`action`/`to_state`).

## 9. PII spot-check (SC-004)

- Sample evidence files under `data/evidence/` (ARIA snapshots, network shape records) from a
  completed run, then run `pnpm --dir apps/crawler audit:pii`.
- **Expect**: zero unmasked names, emails, phone numbers or tokens (the audit prints `OK` and exits 0).

If all nine checks pass, the feature satisfies its acceptance scenarios and success criteria
as written in `spec.md`.
