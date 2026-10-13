# Plan 020: Roadmap declutter (R-52)

Spec: [spec.md](spec.md) · Branch `feature/020-r52-roadmap-declutter` · 2026-10-12

## Summary

Five independent groups of small fixes, each in the place its code already lives. No schema
migration, no new agent tool, no new dependency. The crawler changes (pop-ups, trace depth) touch
`mcp-server/src/runtime/**` and `crawler/src/**`, so their task group runs the slow tier; the
proving-ground link (F-19) also needs it.

## Constitution check

- **I Observed vs inferred**: pop-up screens are observed pages; the F-19 analysis is a finding, not
  documentation. Pass.
- **III / VII one agent, deterministic tools**: no new tool; the pop-up is followed by the server
  the way a link is. Pass.
- **V Safety**: the pop-up's URL goes through the same `decide({kind: 'navigate'})` gate as
  `navigate`; requests of the pop-up window itself already pass the context-wide request gate. Trace
  runs drop only the depth budget; `max_steps`, time and scope still apply. Pass.
- **Code guidelines**: size limits (G-01..), the patterns for a pipeline step and a gate case; cite
  ids in the review.

## Design per group

### G1 Evals (R-40) — `apps/crawler/evals`, `apps/crawler/packages/gates`

- **Fast tier (F-03@014)**: the two pure test files move out of the `gates` project: the `gates`
  config excludes `tests/eval-*.test.ts`, and the root `repo` project includes
  `packages/gates/tests/eval-*.test.ts`. Both import only `src/eval.ts` / `src/eval-checks.ts`
  (zod), so no estate is needed.
- **Outcome (F-04@014)**: `classifyOutcome(out: CliOut): AgentOutcome` in a new
  `evals/harness/outcome.ts` (`'success' | 'budget_end' | 'api_error' | 'usage_limit'`), pure, with
  unit tests in `evals/tests/outcome.test.ts`. `runAgent` returns `{ out, outcome }`; abort on
  `api_error`/`usage_limit`, with exit code **3** for a usage limit so a shell chain
  (`pnpm eval a && pnpm eval b`) stops and the cause is clear. `EvalResult` gains optional
  `outcomes: { crawler, ba? }` (older results stay valid).
- **One at a time**: a lock file `data/evals/.lock` holding the pid; a second eval refuses while the
  pid is alive (stale lock taken over). Removed on exit.
- **Ports (F-16@009)**: `preflight` checks the task's server port (from its probe URL) with
  `ss -ltnpH sport = :<port>`; if a listener is there it refuses (exit 2) naming the port and pid/
  command. Today's "already up → reuse" path goes, so an eval always measures the build it started.
  `stopServer` waits up to 5 s for the port to be free after signalling the group, then kills the
  group with SIGKILL and reports a port still held.
- README: chain and exit codes.

### G2 Small fixes (R-36 part)

- **F-12@008**: `docs/src/render/model.ts` `layoutBoxes` keeps role and name; for `radio` /
  `checkbox` / `switch` the region box is widened right by `labelWidth(name)` (≈ 0.6 em per char at
  the page's body size, 16 px, plus 8 px gap), clamped to `page.width`. Pure helper
  `widenForLabel(box, role, name, pageWidth)` in `images.ts`' neighbour `regions.ts` (new, small)
  with unit tests; a golden test asserts the crop of a radio region contains its label width.
- **F-05@004**: `enqueue.ts`: when the action row exists and its stored `allowed`/`skip_reason`/
  `safety_class` differ from the new decision, update the row. Test in
  `mcp-server/tests` (re-issue at a shallower depth flips the stored refusal).
- **F-16@004**: `records.ts` `reviseRecord`: after validation, the previous revision's
  `doc_evidence_links` whose `run_id` is not null and not in the session's runs are copied to the
  new revision unless the same `(target_kind, target_id, region)` is already cited. Test in the BA
  service tests.

### G3 Crawler (R-35 part)

- **LO-08**: the gate becomes a `gate`: a run of its own adds a product (LO-10 made the div button
  clickable), opens the cart, expects the raw key in the snapshot.
- **LO-27**: `BrowserSession` keeps opened windows as promises of their URL
  (`waitForURL(not about:blank, 5 s)`, then close), `takeOpened()` returns them. In `act` (map
  mode), after `perform`, if the main page did not navigate and a window opened, the first opened
  http(s) URL is gated as a `navigate` and opened in the main page before `processPage`; the edge
  therefore leads to the pop-up's screen. A refused or failed pop-up is recorded in the result's
  reports and the run stays on the opener. In a trace, the URLs are reported only. The gate
  becomes a `gate`.
- **F-14@004**: `gateContext` gives trace runs `scope.max_depth = Number.MAX_SAFE_INTEGER`; a test
  traces past a portal `max_depth`.
- **F-19@015** (analysis): S08 `/legacy/insurer/szkoda-stara.do` has no link anywhere in the estate
  (only its own form and redirect point at it), so no crawler can reach it: a proving-ground gap.
  Fix: the insurer's claims screen links the old form ("Stary formularz zgłoszenia szkody"), as a
  modern app keeps a link to its legacy part. S11 `/legacy/bank/szczegoly.do` is linked from
  `lista.do` only through an image without `alt` inside a link (LO-12 table layout): analyse with a
  gate-style check whether the extractor issues an action for it; fix if clear-cut, else record and
  move to R-35.

### G4 Pan and zoom (R-19) — `apps/dashboard`

- `static/js/diagrams.js` after `mermaid.run`: every `figure.diagram svg` gets pan/zoom: wheel
  (zoom around the pointer), pointer drag (pan), two-pointer pinch, buttons "+", "−", "fit" in a
  small toolbar. Implemented on the SVG `viewBox`; "fit" restores the original. A diagram taller
  than its box gets a fixed max height with the toolbar. Styles on Console tokens in `app.css`.
  The `frontend-dev` agent's design check applies.
- A route test asserts the toolbar markup hook is present; the behaviour is checked in a browser
  once (manual, screenshot in the findings).

### G5 Stale (T074, roadmap)

- T074 review by reading: every `page.` / `frame.` call in `crawler/src` and `mcp-server/src` that
  acts or requests, against `action-gate.ts` / `request-gate.ts`; `agent-lockdown.test.ts` against
  `.claude/agents/crawler.md`; `.mcp.json` and agent files. Result in
  `specs/020-roadmap-declutter/findings.md`; T074 ticked in spec 001.
- Roadmap: R-52 row; R-19, R-40 done by R-52; R-35 and R-36 keep their remaining items; R-47 paused.

## Verification

- G1, G2, G4, G5: fast tier (`pnpm typecheck && pnpm lint && pnpm test:fast` in `apps/crawler`;
  dashboard `uv run ruff check && uv run pytest -n auto -m 'not perf'` and `-m perf`).
- G3: also `pnpm test:slow` in `apps/crawler` and `uv run pytest` in `apps/proving-ground/backend`.
- Close-out: `pnpm test` in `apps/crawler`, every app's suite, code-reviewer, glossary, changelog.

## As built (deviations from the plan above, 2026-10-12)

- **Lock**: in the OS temp folder (`pathfinder-eval.lock`), machine-wide, not `data/evals/.lock`
  (the usage quota is account-wide, and `data/evals` is tracked).
- **Ports**: checked in `ensurePortal` (it knows the task's ports, now listed per server in
  `tasks.ts`), not in `preflight`.
- **F-12@008**: helper `withLabel` in `docs/src/render/label-box.ts`; it also leaves wide boxes
  (a styled card already holding its label) alone.
- **F-16@004**: no dedupe: a carried link's run is outside the session, so the revision can never
  cite the same link again; deduping on target alone would have dropped real evidence.
- **LO-27**: the proving-ground pop-up has no URL (`document.write` into `about:blank`), so the
  "open it in the main page" design could not record it. Built instead: pop-ups with a URL are
  queued as `navigate` frontier items after the page settled (`pipeline/popups.ts`), gate
  `F-04@020`; the script-written window stays a known gap (findings F-04). Fixing it surfaced a
  latent `request.frame()` crash for pop-up requests (findings F-05).
- **F-19@015**: S08 linked from the policy screen (S04), not the claims wizard; S11 analysed and
  left (findings F-06).
- **T074**: only the static half; the live bypass-attempt run stays open.
