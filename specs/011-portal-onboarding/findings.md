# Findings: spec 011 (R-31)

Bugs, gaps and slips found while running R-31, with test or eval ideas (see spec 010
`findings.md` for the R-30 ones).

## F-01 `pathfinder` MCP servers in Claude Code sessions do not start: `tsx: not found` (fixed)

- Symptom (2026-10-07): a Claude Code session in the repo reported `pathfinder` and
  `pathfinder-ba` as "Connection closed". `pnpm --dir apps/crawler --filter @pathfinder/mcp-server
  start` (the `.mcp.json` command) fails with `sh: 1: tsx: not found`; `pnpm reference-portal`
  the same.
- Cause: since the root pnpm workspace (spec 010 T003) the workspace root is the repo root, which
  has no `package.json` and so no `node_modules/.bin`. `@pathfinder/mcp-server` and
  `@pathfinder/reference-portal` run `tsx` in their `start` scripts but never declared it; before
  T003 they got it from `apps/crawler`, then the workspace root. The chat service hid it: the
  servers it spawns inherit its PATH, which holds `apps/chat/node_modules/.bin/tsx`.
- Fix: `tsx` added to the devDependencies of both packages (lockfile updated).
- Test idea: a smoke test that starts each `.mcp.json` server with a clean PATH (no inherited
  `node_modules/.bin`) and lists its tools; same for every `start` script under `apps/`.

## F-02 After [reset assistant] a resume asks the BA for the persona (fixed)

- Symptom (2026-10-07, live, wikipedia): after a stop and [reset assistant], "Resume the scan."
  → the assistant called `request_scan` with persona "anonymous", was refused, and asked the BA
  "What persona name did the first scan use?".
- Cause: `request_scan` required `persona` even with `resume_run_id`; `workflow_state` does not
  name a run's persona and the reset assistant has no earlier messages, so it guessed.
- Fix: `persona` is optional when resuming; the run's own persona is used (`apps/chat/src/scan.ts`,
  test in `mcp-chat.test.ts`). Rechecked live: reset → "Resume the scan." → resumed as guest
  with no question.
- Test/eval idea: eval "stop, reset, resume" and assert no question to the BA and the same
  persona on the resumed run.

## F-03 Wikipedia maps at ~40 s per page: every subresource waits in the portal's rate limiter (option added)

- BA decision 2026-10-07: images stay on by default (a human needs them); the BA may skip them
  per scan (FR-014, T014). Other ideas below not taken.

- Symptom: 9 pages in ~5 active minutes. Per `act`: `reach_state` ~25 s (reloading the source
  page) and `settle` always hitting its 10 s cap; limiter waits up to 15 s per request.
- Cause: the portal limit (2 req/s, concurrency 1, the dashboard default) applies to every
  request of the page, images and scripts on CDN hosts (`thumb.wikimedia.org`,
  `upload.wikimedia.org`) included; ~30 requests per Wikipedia page. The page never settles
  because the queue keeps it loading.
- Scale: 1578 links queued after 10 pages; at this rate the 600-step budget would take ~6–7 h.
- Ideas (not decided): rate-limit only main-frame documents and XHR/fetch on the portal's hosts;
  skip images/fonts on map runs; let `settle` ignore requests still queued in the limiter. Also
  the dashboard default limit could be raised for production sites that can take it.
- Test/eval idea: a gate page with 30 images on a second host; assert an `act` under a time cap.

## F-04 A stop the BA asked for shows as a failed step with an error reference (fixed in T016)

- Symptom: after [stop], the tracker shows "Scan [FAIL] failed reference ERR-…", and the
  assistant tells the BA "the scan stopped with error reference ERR-…". The error log line says
  "The scan was stopped before it finished … Ask the assistant to resume it".
- Cause: by design since spec 010 T041, an interrupted run fails the scan step with a reference.
  Right for a crash; reads like a fault when the BA pressed [stop].
- Idea: a "stopped" step status (or "to do" with "stopped, resume?") when the stop came from
  [stop] or [stop scan]; keep failed + reference for interruptions nobody asked for.

## F-05 An unreachable address kills the `pathfinder` server (fixed)

- Symptom (2026-10-07, spec 010 quickstart step 5): a new portal at `http://127.0.0.1:4459/`
  (nothing listening), "Scan the portal as a guest." → the crawler's first `navigate` returned
  `Connection closed`; the next call `RUN_STOPPED`. Reproduced on the bare server: `route.fetch:
  connect ECONNREFUSED`, unhandled rejection, exit 1.
- Cause: for a main-frame navigation the request gate fetches the page itself (robots and
  redirect checks) and rethrew a fetch error from the Playwright route handler. Only reachable
  when robots.txt does not stop the run first, so `robots: ignore` (now the form's default) made
  it common: any typo in a portal address or a site that is down.
- Fix: the gate aborts the route with the matching network error (`connectionrefused`,
  `namenotresolved`, `timedout`, …), so the browser sees a failed navigation
  (`packages/crawler/src/request-gate.ts`, test in `request-gate.test.ts`). Rechecked on the bare
  server: `navigate` returns, the server stays up.
- Test/eval idea: a gate case that navigates to a closed port and to an unresolvable host and
  asserts the server answers the next tool call.

## F-06 A failed navigation is recorded as a page (fixed in T017: `NAVIGATION_FAILED`)

- Symptom: after F-05, `navigate` to the closed port returns a state with an empty title, route
  `/`, no actions: Chrome's error page.
- Cause: `session.goto` swallows navigation errors by design ("the caller checks
  `gate.stopped`"), and the page is then recorded like any other.
- Idea: `navigate` answers a refusal such as `NAVIGATION_FAILED: net::ERR_CONNECTION_REFUSED`
  and records nothing when the main-frame navigation failed; the assistant can then say the
  address is wrong or the site is down.

## F-07 The error log says "stopped … resume it" for a site that cannot be reached (fixed in T017)

- Symptom: same run as F-05: the error reference's log line says "The scan was stopped before it
  finished … Ask the assistant to resume it", while nothing was recorded and resuming cannot
  help. The assistant's own reply was right ("the connection was closed straight away… check
  the address").
- Cause: the step recorder writes one message for every interrupted run.
- Idea: when the run recorded no page, say "the scan could not open the portal's address" and
  keep the crawler's error in the log detail.

## F-08 The orchestrator's planning text reached the BA (prompt line added in T015; watch in evals)

- Symptom: the assistant's reply began "Need a guest persona. Try request_scan with persona
  "guest"? Not known if exists. Try." before the real answer.
- Cause: the model wrote its plan as a visible text block (the session transcript has it as
  `"type":"text"`, not thinking); the ACP client forwards only `agent_message_chunk`, correctly.
  Idea: a line in the orchestrator prompt ("write only to the BA; plan silently").
- Test/eval idea: assert no assistant message starts with tool names or a question to itself.

## Live runs seen 2026-10-07 (SC-001, spec 010 T038 slice)

- SC-001 (chat service on a separate `sc001` store, throwaway portal `wikipedia-sc001`,
  production https://www.wikipedia.org/, limit "only look"): `POST /portals` (the form's call)
  → new conversation → "Scan the portal as a guest." → run row `running` in production after
  **16.6 s**. Orchestrator: `workflow_state`, `request_scan`, crawler subagent, `start_run`, no
  question asked. Then [stop] → run interrupted, two notices; [reset assistant] → notice;
  "Resume the scan." → resumed (after F-02); dashboard progress feed, live map (10 pages) and
  tracker rendered for the conversation. Throwaway files deleted; its rows stay in
  `data/db/sc001.sqlite`.
- Orphaned `pathfinder` server and Chromium after stopping the chat service: reproduced twice
  (spec 010 F-19, known); stopped by hand.
- The host went to sleep mid-run (Hyper-V time sync in `dmesg`): every process paused ~12 min;
  the trace's wall-clock span was 12.6 min against 34 s of monotonic time. Not a product bug;
  the activity counter ("26m 45s of activity") counts the pause.

## SC-003 live check (2026-10-07)

Driven through the real `pathfinder` server (stdio) on a scratch root with four throwaway portals
against a local site whose robots.txt disallows `/private`, and a second one whose robots.txt
answers 503:

| portal | robots.txt | result |
|---|---|---|
| `robots: ignore` | disallows `/private` | run started, `/private` visited, no robots fetch recorded |
| no field | disallows `/private` | run started, `/private` refused (`robots:Disallow: /private`) |
| `robots: ignore` | 503 | run started, `/private` visited, no robots fetch recorded |
| no field | 503 | `start_run` refused: `ROBOTS_UNAVAILABLE` |

## F-09 "Only the English site, only searching for a pickle" could not be done (fixed in T019–T021)

- Symptom: on Wikipedia with a stopped scan, the BA asked for an English-only scan of searching
  for a pickle. The assistant said only the stopped scan could be continued (the whole site,
  from the language picker) and offered to save a new persona to narrow it.
- Causes: (1) the `scan` move was valid only before anything was recorded; (2) the only way to
  narrow a scan was a persona's `scope_restrictions`, whose domain narrowing also drops a
  subdomain of a portal domain (`narrowScope` keeps portal domains inside the restriction, so
  `wikipedia.org` ∩ `en.wikipedia.org` is empty); no exclusions existed; (3) the chat had no
  tool to start a process trace at all, although `map_process` was proposed.
- Fix: per-scan `focus` (FR-017), new scan allowed (FR-018), `request_scan` `process` (FR-019).
- Not fixed: the persona narrowing of subdomains (2) is unchanged; personas are not used for this
  any more.
- Test/eval idea: "scan only <subdomain>, leave out <path>" must give a run whose snapshot holds
  the focus and no state outside it; the assistant must not call `save_persona` for it.

## F-10 A read-only trace refused to type in an allowed search box (fixed in T020)

- Symptom (live, 2026-10-07, run 01a11736-46a0): "map searching for a pickle", read-only. The
  crawler opened en.wikipedia.org, saw the search box and button marked `read`/allowed, and
  finished `abandoned`: "typing in the search box and submitting it … the read-only instruction
  excludes".
- Cause: the chat's crawler brief spelled read-only as `max_action_class "read" (only look: no
  form is filled or submitted)`; the agent followed the words over the server's verdict.
- Fix: the brief says the server enforces the limit and to act on every allowed action,
  searching included. Test in `mcp-chat.test.ts`.
- Test/eval idea: a read-only trace with a GET search as its goal must reach `goal_reached`.
