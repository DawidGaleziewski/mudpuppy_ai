# Session dump 2026-10-07 morning: R-31 live checks (autonomous, BA away)

Branch `feature/011-r31-portal-onboarding` (holds R-30 too). Nothing pushed or merged.

## Done (commits)

- b322c9c F-01: `tsx` declared in `@pathfinder/mcp-server` and `@pathfinder/reference-portal`.
  The `.mcp.json` servers (`pathfinder`, `pathfinder-ba`) did not start in Claude Code sessions
  since the root workspace (R-30 T003); the chat service hid it. Roadmap R-31 row now covers
  phase 2. SC-003 checked live.
- 91bdcaf F-02: a resume after [reset assistant] takes the run's own persona (the assistant had
  guessed "anonymous" and asked the BA). SC-001 checked live: run running 16.6 s after the
  portal was added. Spec status and success criteria updated.
- b524f8f F-05: an unreachable portal address crashed the `pathfinder` server (unhandled
  `route.fetch` ECONNREFUSED in the request gate); now aborted as a network error.
- Gates green at each commit: crawler 1351 passed, chat 214.
- Glossary: already in sync (no change from `pathfinder-glossary --write`).

## Open findings (`specs/011-portal-onboarding/findings.md`)

- F-03 Wikipedia maps at ~40 s per page: images/scripts on CDN hosts queue in the 2 req/s limiter.
- F-04 A stop the BA asked for shows as "failed" with an ERR reference.
- F-06 A failed navigation is recorded as a page (Chrome's error page).
- F-07 Error log message "stopped … resume it" for a site that cannot be reached.
- F-08 The orchestrator wrote its plan as visible text ("Need a guest persona. Try …").
- Known (spec 010 F-19): stopping the chat service orphans its `pathfinder` server and Chromium;
  reproduced twice, cleaned by hand.

## speckit-analyze on spec 010 (T039 input; read-only, nothing edited)

| ID | Severity | Where | Finding | Suggested fix |
|---|---|---|---|---|
| C1 | CRITICAL | spec FR-020, edge case l.123, Assumptions ("production stays read-only"); plan Constraints; T029 ("missing compliance") | Contradicts constitution 4.0.0 (production may write per limit, compliance gate dropped, `robots: ignore`) | Reword to "the constitution's safety rules in force (4.0.0) apply unchanged to chat actions"; note T029's compliance case is gone |
| D1 | MEDIUM | `.specify/memory/constitution.md` top | "SYNC IMPACT REPORT (temporary; remove before commit)" is committed | Remove at R-31 close-out |
| I1 | MEDIUM | plan Constitution Check "App layout" first row | Says new TS code goes into `apps/crawler`; the next row and the spec say `apps/chat` | Delete the stale row |
| I2 | MEDIUM | T016 | Names `.claude/agents/orchestrator.md`; the file is `apps/chat/agents/orchestrator.md` | Fix the path in tasks/contracts |
| I3 | LOW | plan "Post-design re-check" | "open points are T002 and T003": both done | Update |
| G1 | MEDIUM | SC-001, SC-005, SC-006 | Need live/owner checks: SC-001 shown for a new portal (16.6 s); SC-005 (scoped docs < 10 min, real agent) not run live; SC-006 is the owner's review | Part of T038 / sign-off |
| G2 | LOW | FR-009 | "failed" status also used for a deliberate stop (see R-31 F-04) | Decide on a "stopped" status |

Coverage: 23/23 FRs have tasks (FR-001 T019; FR-002 T010/T015; FR-004 T015/T021; FR-006
T018/T020; FR-008 T013/T029; FR-009 T022/T023; FR-011 T009/T025; FR-014 T027; FR-016 T028;
FR-021 T011/T032; FR-023 T034; …). Tasks 52, done 50 (T038, T039 open). Critical 1.

## T038 (R-30 real-agent pass): what this session added

Steps covered live today on a new portal: 2 (opening message, proposals), stop, reset, resume,
progress feed, live map, tracker, step 5 (unreachable URL → one log line with ERR id, no
credential; found F-05/F-07). Not run: 3 (persona built in conversation + credentials form),
7 (narrow to a process, scoped docs: SC-005), 9–10 (amendments, superseded after a portal
change) with a real agent. Those need a full reference-portal scan (expensive, R-24 P5).

## Left for the BA

See the questions in the final chat message. Throwaway portals were deleted; their rows are in
`data/db/sc001.sqlite` (a separate data store, pick it in the header to look, or delete it).
