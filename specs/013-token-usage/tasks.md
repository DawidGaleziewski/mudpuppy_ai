# Tasks: Token usage optimisation (spec 013, R-24)

**Input**: `specs/013-token-usage/` (spec.md, plan.md). Branch `feature/013-r24-token-usage`.

**Model tags**: `[opus]` judgment, pipeline and inference code, reviews; `[sonnet]`
code-touching but well specified (tests, BA read shapes); `[haiku]` text edits from an exact
list. Sonnet/Haiku run as background subagents from a brief naming the exact files; they never
stash, checkout, reset, add or commit. Opus reviews, runs the tiers and commits per group.

**Rules**: Edit tool only, re-read after editing; log every bug or slip in `findings.md` with a
test/eval idea; behaviour unchanged except the spec's shapes (FR-009).

## Phase 1: Setup and baseline

- [x] T001 [opus] Branch, spec, plan, tasks; `.specify/feature.json` → `specs/013-token-usage`.
- [x] T002 [opus] Baseline measurement: `mcp-server/tests/token-budget.e2e.test.ts` (scripted
  drain, re-read proxy) and `apps/crawler/scripts/tokens-ba-reads.ts` (`pnpm tokens:ba`);
  numbers in plan.md.
- [x] T003 [haiku] `findings.md` (shape of spec 012's) with F-01 (BA actions rows return
  `role`/`name` null) and the baseline table; `tokens:ba` script entry in
  `apps/crawler/package.json` and the operator-script list in `apps/crawler/CLAUDE.md`.

## Phase 2: US1 slim known-state results (P1)

- [x] T004 [opus] [US1] `process-page.ts`: map mode + `alreadyInRun` → no `actions`,
  `actions_omitted`; `include_actions` on `NavigateInput`/`ActInput` (`runtime.ts`), the
  pipeline and `tools/index.ts` (args + descriptions).
- [x] T005 [sonnet] [US1] Update the e2e tests that read `actions` from a revisit
  (`map-run.e2e.test.ts` and any other `*.e2e.test.ts`/gate reading `.actions` after a revisit)
  to pass `include_actions: true`; add AS1.1–AS1.4 cases to `map-run.e2e.test.ts`.

## Phase 3: US2 one execution per link target (P1)

- [x] T006 [opus] [US2] `enqueue.ts`: `target_url` in issued link actions (R3).
- [x] T007 [opus] [US2] `services/same-target.ts`: infer at pick time (R2, R4), trace event
  `frontier_infer`; `services/frontier.ts` loops over inferred items.
- [x] T008 [sonnet] [US2] Tests: service test for AS2.1–AS2.3 on a seeded store
  (`tests/same-target.test.ts`), e2e assertion on the insurer mock that executed edges per
  target ≤ 1 and inferred edges exist (`insurer-mapping.e2e.test.ts`).
- [x] T009 [opus] [US2] Consumers: golden snapshot (`pipeline-golden.e2e.test.ts`), gates,
  dashboard live map, docs export/evaluate with inferred edges; fix or accept on purpose.

## Phase 4: US3 next item on the result (P5)

- [x] T010 [opus] [US3] `next` on map-mode `navigate`/`act` results (R5), type in `runtime.ts`,
  tool descriptions.
- [x] T011 [haiku] [US3] Loop text in `.claude/agents/crawler.md` (Procedure 2–4, known-state
  results, `include_actions`) and the crawler brief in `apps/chat/src/scan.ts` (+ its test
  expectations if they quote the text).
- [x] T012 [sonnet] [US3] Tests: AS3.1–AS3.2 in `map-run.e2e.test.ts`; `harness.ts` `crawl`
  follows `next`. Done as: `next` asserted in the new US1 test of `map-run.e2e.test.ts` (T005)
  and the whole drain follows `next` in `token-budget.e2e.test.ts`; `harness.ts` `crawl` left on
  `get_next_frontier_item` (still supported, keeps the older tests on the original loop).

## Phase 5: US4 + US5 BA reads (P3, P4)

- [x] T013 [sonnet] [US4] `services/ba/reads.ts` elements → keys + `elements_without_box`;
  tests `ba-screen-region.test.ts`, `ba-reads.test.ts`; `contracts` docs in spec 008 if they
  show the shape.
- [x] T014 [sonnet] [US5] `services/ba/reads.ts` lean page items (null omission, page-level
  confidence, F-01 fix); tests in `ba-reads.test.ts`.
- [x] T015 [haiku] [US4] [US5] Text: `.claude/skills/ba-practice/SKILL.md`,
  `.claude/agents/ba.md`, BA tool descriptions in `ba-tools/index.ts`.

## Phase 6: Polish and close-out

- [x] T016 [opus] Re-measure (token-budget test, `tokens:ba`), set the budget assertion in
  `token-budget.e2e.test.ts` (SC-001), results in plan.md / findings.
- [x] T017 [opus] Full tiers: `pnpm test` in `apps/crawler`, chat, workflow, dashboard pytest.
- [x] T018 [opus] Real-agent check (SC-004): one Sonnet crawler drain of the reference portal,
  usage summed from its transcript; compare with F-16.
- [x] T019 [opus] `code-reviewer` agent on the branch; fix or defer findings.
- [x] T020 [haiku] Roadmap R-24 row (done + results), glossary entries (inferred link
  target, `next` item) and `uv run pathfinder-glossary --write`, CHANGELOG via the changelog
  skill. Merge waits for the user's review.
