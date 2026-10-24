# Session dump 2026-10-24: R-106 (spec 078), the designer's round 4

Branch `feature/078-r106-designer-round4`, NOT merged yet; last commit a916cead (+ this dump).

## Next steps (in order)

1. The full crawler suite `pnpm test` (gates + perf) was running in the background when the
   context was compacted; its log: `/tmp/claude-1000/-home-dawid-projects-pathfinder-ai/cd9b79cf-f3b0-406f-8c61-2374458d2a8f/scratchpad/crawler-test.log`
   (last line `exit N`). If it was lost, run `pnpm test` in `apps/crawler` again (ports
   4200/4201/4400 free first).
2. `uv run pytest -m 'perf or serial'` in `apps/dashboard` (not run yet; run it alone).
3. Tick T070 in `specs/078-r106-designer-round4/tasks.md`, squash-merge to master as
   "R-106 (spec 078): … (v2.10.0)", tag v2.10.0, push, delete the branch (the pattern of v2.9.2).
   The changelog entry is in `CHANGELOG.md` [Unreleased] already; the roadmap row R-106 says done.
4. Write memory `r106-spec078-state.md` + a MEMORY.md line; stop nothing (no services running).

## Done

- The design package round 4 (`user_input/mudpuppy-design-round4-2026-10-24.zip`) taken in:
  `docs/design/salvage-yard` (docs/20-navigation-and-canvases, T-01…T-14), CSS synced into
  `apps/web` (`pnpm ds:sync`), skill `mudpuppy-salvage-ui` patched.
- Every task built, one commit per group (spec `specs/078-r106-designer-round4/`: spec, tasks,
  data-model, findings with D-1…D-7, F-01…F-07, close-out review):
  header store and Ask status (T-11), All portals nav and first visit (T-12), loader and
  skeletons (T-10), came from and pager (T-01, T-02), row pictures and the browsing dialog (T-03,
  T-04), In no process and Add to process as a scope change (T-05, migration 0051), merging two
  processes with Undo / Split back (T-06), engage-to-zoom canvases and full screen (T-07, T-08),
  the Mermaid theme and capability List (T-09), Didn't start and the server-placed live map
  (T-13), layout stability and `pnpm --dir apps/dashboard cls:check` (T-14).
- Checks: web `pnpm check` 239 tests, build, Storybook; chat 387 + e2e 8 / 8; dashboard parallel
  suite; workflow 29; `ui:check` 10 pages at 1280 and 390; `cls:check` 26 measurements, worst
  0.016; code-reviewer: 2 findings fixed.

## For the owner to review

D-1 (Changes, Review, Settings shut on All portals: no cross-portal pages), D-2 (row pictures are
the full recording), D-3 ("Updating" under the header), D-4 (Start again asks the assistant), D-5
(Add to process asks first, Undo after), D-6 (menu uses the default persona), D-7 (data pages
empty for 300 ms, not the old page). All in `specs/078-r106-designer-round4/findings.md`.

## Loose ends

- F-07: `/tmp/pf-eval-mcp-*.json` count is 70; new ones appear while the commit hook runs the
  crawler fast tier, so spec 077's exit cleanup misses test runs (`apps/crawler/evals/harness/agent.ts`).
  R-106 leftover (9).
- Migration 0051 is on the branch: never run the chat service on local-dev before the merge.
- `personas/reference-insurer-local/agent-anna.yaml` stays untracked (owner's).
