# Session dump: 2026-10-02, R-13 reference-portal map run and hand-off to the BA server build

Branch `feature/004-r13-ba-documentation` (reset to `master` this session, pushed). Read this, then the
2026-10-02 notes at the end of `roadmap.md`, then `specs/004-ba-documentation/tasks.md` (T009–T032) and
`specs/004-ba-documentation/contracts/ba-mcp-tools.md`.

## Next session: what to do

Build the BA server, tasks **T009–T016, T018–T028** of `specs/004-ba-documentation/tasks.md` (T017 and
T029–T031 are already `[X]`). Decisions the user made on 2026-10-02:

- Claude does **all** of it. The user no longer wants to write tasks themselves (this replaces the
  "user is learning and wants to do some of the work" line in `CLAUDE.md`).
- Everything on **Opus** for now; no Sonnet split for this block.
- **Work without asking questions.** The user is asleep and reviews in the morning. Take the sensible
  default, keep going, and collect every gap, doubt and decision in one list at the end (and in a new
  session dump). Stop only for something destructive or outward-facing that is not covered below.
- Pushing this feature branch is approved. Merging to `master` is not: leave that for the user.
- Follow the tasks as written, including T015 seeding network calls in the fixture store even though the
  real reference portal makes none.
- `.mcp.json` stays on `PATHFINDER_ENV=sandbox`. No live (liveinsurer) run.

Commit groups (task ids in the message, per `CLAUDE.md`), push after each:

1. T009–T016: schema tests, `keys`, `status-engine`, `relations`, `observed-rule`, fixture store, `evidence`
2. T018–T021: failing BA tests (lockdown, session, records, reads)
3. T022–T026: error codes, `services/ba/*`, `ba-tools/index.ts`, `ba-main.ts`; add the `pathfinder-ba` entry
   back to `.mcp.json` at T026 (the `start:ba` script already points at `ba-main.ts`)
4. T027–T028: `docs:audit` and the end-to-end test

Tick each task `[X]` in `tasks.md` as it lands and update the R-13 note in `roadmap.md`.

**T032 cannot be finished in the same session as T026.** Claude Code loads MCP servers at session start,
so the `ba` agent only gets its `pathfinder-ba` tools in a session opened after T026 is committed. Leave
T032 `[ ]` and put "open a new session, run the `ba` agent on run `01a0fe67-…`, then
`pnpm docs:audit reference-insurer --env sandbox`" on the end-of-run list.

## State at end of this session

- Working tree clean after this dump is committed. Commits: `6fc9b9f` (reference portal configs, roadmap
  notes, R-18), then this dump. Both pushed.
- Checks at `6fc9b9f`: `pnpm typecheck`, `pnpm lint`, `pnpm test` all pass (64 files, 833 tests, ~200 s).
- T006 `[X]`. T032 `[ ]` with a note: map half done, BA half owed.
- Roadmap: R-18 added (to discuss, no spec): API discovery depth and browser tooling.

## The map run (T032, map half)

- Run `01a0fe67-3a93-7000-9fc4-035a144567ff`, portal `reference-insurer`, persona `guest`, mode map, in
  `data/db/sandbox.sqlite`, status `completed`, frontier empty.
- 12 states: `/`, `/ubezpieczenia/samochod`, `/ubezpieczenia/dom`, `/ubezpieczenia/podroze`, `/porownanie`,
  `/kalkulator/pojazd`, `/kontakt`, `/faq`, `/slowniczek`, `/moje-polisy`, `/moje-polisy/przedluz`,
  `/logowanie`. 195 actions executed, 6 skipped at the read ceiling (5 mutating, 1 external-side-effect).
- 2 rule candidates (both login walls), 3 open questions (unmapped calculator steps; compare and
  travel-quote results; `/faq` sharing a cluster with `/ubezpieczenia/dom`).
- Dashboard: `http://127.0.0.1:8765/runs/<id>?env=sandbox` (it opens on `production` by default, where
  the run is a 404). The run page and `&tab=trace` returned 200; the rendered pages were not inspected.

Findings:

- `api_endpoints: 0` is correct. The reference portal is server-rendered HTML only: no JSON route, no
  `fetch`/XHR; its one inline script toggles the `Dalej` button on the driver step.
- Five of the portal's eight forms are `method="get"` (three calculator steps, travel quote, comparison),
  but map mode classes their submit buttons as mutating and skips them. Unmapped as a result:
  `/kalkulator/kierowca`, `/kalkulator/opcje`, `/kalkulator/wynik`, `/ubezpieczenia/podroze/wynik`,
  `/porownanie/wynik`. **User decision: keep it this way; trace mode (R-14, T033–T050, not built) reaches
  them.** Expect the BA to raise follow-ups for these.
- Not investigated: the shared cluster id for `/faq` and `/ubezpieczenia/dom`; each state reports its form
  only on the first visit (`forms: 0` on revisits).

## R-18 (to discuss later, nothing decided)

- The crawler already records page-made `xhr`/`fetch` calls: method, path template, status, request and
  response body shapes, linked to the triggering action (`packages/crawler/src/network-recorder.ts`). It
  does not record classic form POSTs or WebSockets, drops bodies over the size cap, and never says what a
  call means (the BA interprets).
- Idea from https://stevekinney.com/writing/driving-vs-debugging-the-browser (Playwright MCP drives,
  Chrome DevTools MCP debugs). Position so far: neither goes to the crawler agent, since a second browser
  would bypass the `pathfinder` server's scope, denylist, robots, rate-limit, read-ceiling and PII gates.
  DevTools MCP may help developers check what the recorder missed. Richer capture belongs in the recorder.

## Things that cost time this session

- **Commit from the repo root.** A PreToolUse hook on `git commit` runs
  `cd apps/crawler && pnpm typecheck && pnpm lint && pnpm test`; it fails with "can't cd to apps/crawler"
  if the shell is anywhere else. A `cd` inside a compound Bash command moves the shell for later calls, so
  `cd /home/dawid/projects/pathfinder-ai` in its own call first. The hook takes about four minutes; give
  the commit a 600000 ms timeout and do not also run the checks by hand just before.
- `pathfinder` MCP `act` calls can be sent many per message; each returns in about a second. Asking
  `get_next_frontier_item` between every action is not needed when the action ids are already known.
- The scripts live in `apps/crawler/package.json`; there is no root `package.json`.

## Environment

- Reference portal was running on `127.0.0.1:4010` (`cd apps/crawler && pnpm reference-portal`) and the
  dashboard on `127.0.0.1:8765` (`cd apps/dashboard && uv run pathfinder-dashboard`). Neither is needed
  for T009–T028 (the tests start their own portal and use `:memory:` stores); both are needed for T032.
- `portals/liveinsurer/portal.yaml` has its compliance fields and contact user agent filled in (2026-09-25), so
  a live run is unblocked on the config side. Not planned; the goal is measured on the reference portal.
