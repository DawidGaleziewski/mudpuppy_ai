# Learning roadmap

A personal study plan for getting better at evals, harness building and working with AI (Claude and
others), tied to this project. Written 2026-10-09 from an honest review of Pathfinder / MudPuppy.

**How to use it**

- Work through the sections in order. Each one has three kinds of checkboxes: **Understand** (read and
  watch), **Practise** (an exercise in this repo) and **Apply** (a change to how you work). Tick a box
  when you can explain the idea to someone else without notes, not when you finished reading.
- Don't start new roadmap features (R-xx) while sections 1–4 are open. They change what you build next.
- When you meet a word you don't know, ask Claude to add it to [`glossary.md`](glossary.md).
- Every link was found by search on 2026-10-09. Course prices change, so check them before buying.

## Where to start (the first week)

If you only do five things, do these, in order:

1. Read [01 – Evals vs tests](01-evals-basics.md) and Anthropic's
   [Demystifying evals for AI agents](https://anthropic.com/engineering/demystifying-evals-for-ai-agents).
2. Do **exercise 3.1**: run one eval five times and write down the spread.
3. Do **exercise 4.1**: spend 2 hours reading why `processes` is 0 %.
4. Watch the Lenny's Podcast episode with Hamel Husain and Shreya Shankar (section 4 resources).
5. Do **exercise 2.1**: write a small ground truth by hand for one process on a portal Claude has never seen.

## The roadmap

### 1. Evals vs tests: the basics → [01-evals-basics.md](01-evals-basics.md)
- [ ] Understand: what an eval is, how it differs from a test, and what task, trial, grader, transcript and outcome mean
- [ ] Understand: capability evals vs regression evals; where `pnpm test`, the gates and `pnpm eval` fit
- [ ] Practise 1.1: label every check in this repo as a test, gate or eval
- [ ] Apply: every new feature names the eval number it should move before you write the spec

### 2. Ground truth → [02-ground-truth.md](02-ground-truth.md)
- [ ] Understand: what ground truth is, who should write it, and why "Claude wrote it" is a problem here
- [ ] Practise 2.1: hand-write ground truth for one process on a portal Claude never saw (hold-out)
- [ ] Practise 2.2: review the existing reference-portal ground truth line by line
- [ ] Apply: ground truth is written by you *before* the agent runs, and Claude never edits the hold-out set

### 3. Metric validity and noise → [03-metric-validity-and-noise.md](03-metric-validity-and-noise.md)
- [ ] Understand: metric validity, Goodhart's law, why one run is not a measurement
- [ ] Practise 3.1: run one eval 5× and compute mean and spread per category
- [ ] Practise 3.2: find the invalid metrics in `data/evals/` (start with `rules 0/0 = 100 %`)
- [ ] Apply: baselines come from ≥3 runs; tolerances bigger than the measured noise

### 4. Error analysis → [04-error-analysis.md](04-error-analysis.md)
- [ ] Understand: open coding, axial coding, failure taxonomy, saturation
- [ ] Practise 4.1: why is `processes` 0 %? (2 hours, by hand, before any spec)
- [ ] Practise 4.2: open-code 20 failures from crawler and BA transcripts, build a failure table
- [ ] Apply: the next roadmap order comes from failure counts, not from a catalogue written upfront

### 5. LLM as a judge → [05-llm-as-judge.md](05-llm-as-judge.md)
- [ ] Understand: when a judge is the right grader, its biases, and why it must be calibrated
- [ ] Practise 5.1: label 40 (rule, record) pairs yourself as pass/fail
- [ ] Practise 5.2: build a `claude -p` judge for rules and measure its agreement with your labels
- [ ] Apply: a judge is used for scores only after it agrees with you on a held-out set of labels

### 6. Outcome first → [06-outcome-first.md](06-outcome-first.md)
- [ ] Understand: north-star metric, thin end-to-end slice, counting experiments instead of features
- [ ] Practise 6.1: rewrite the top 5 roadmap items with "metric it moves, by how much, how measured"
- [ ] Practise 6.2: design the rebuild eval (SRS in → rebuilt portal out → compare)
- [ ] Apply: a feature that does not move a measured goal waits

### 7. Context engineering and tool design → [07-context-and-tools.md](07-context-and-tools.md)
- [ ] Understand: context window, context rot, tool results as context, sub-agents
- [ ] Practise 7.1: measure what fills a crawler session's context (per tool result)
- [ ] Practise 7.2: run `/context` at the start of a session here and decide what to cut
- [ ] Apply: token cost per step is measured from the first prototype of a new agent

### 8. Working with AI: transcripts, comprehension and process → [08-working-with-ai.md](08-working-with-ai.md)
- [ ] Understand: comprehension debt, the model's typical failure modes, the cost of ceremony
- [ ] Practise 8.1: read one full crawler transcript and one full BA transcript, end to end
- [ ] Practise 8.2: read `evaluate.ts` yourself and explain process matching in your own words
- [ ] Practise 8.3: the process-overhead audit (keep, shrink, automate, drop)
- [ ] Apply: one transcript read per week; hand-write the parts you most want to understand

### 9. From prototype to product → [09-productization.md](09-productization.md)
- [ ] Understand: Claude Code login vs Agent SDK / API key; cost per portal
- [ ] Practise 9.1: estimate the cost of R-33 (100 personas) before building it
- [ ] Apply: a cost estimate is part of every spec that runs agents

## The conclusion (review of 2026-10-09)

**What is already good.** The harness *architecture* is better than most: the crawler gets only 9 MCP
tools (no shell, files or browser); the server owns safety, selectors, ids and recording; the agent only
proposes. That is the right split, a deterministic shell around a non-deterministic core. Facts vs
inferences (`add_rule_candidate`), byte-identical export and evidence-cited BA records are good choices.
Cost was taken seriously once seen (R-24: 38–78M → about 1M cache-read tokens).

**Weaknesses, ranked:**

1. **Evals: you have the machinery but not the method.** Each baseline is a single run, while run-to-run
   noise is huge (bank `terms` 20 → 0 → 40 → 40 → 30 → 0; reference `rules` 31 → 0 → 31 → 56). The ground
   truth is circular: Claude built the proving ground, Sonnet wrote its ground truth, Claude fixed the
   crawler for it and Claude scores it. Some metrics are invalid (`rules 0/0 = 100 %`, ground truths with
   2 screens). Rules and processes are semantic but matched with route and phrase rules. The real goal
   ("docs good enough to re-create the portal") has no eval.
2. **Activity over outcome.** `processes` is 0 % in every eval run ever, on every portal, while 40+
   roadmap items shipped (rebrand, glossary, wiki, chat, switcher...). R-39 sits behind R-28/R-37/R-38.
   Found while writing this folder: the eval (`apps/crawler/evals/`) runs the crawler in **map mode only**, so no trace
   evidence ever exists, and 2 of the 5 reference processes (P02, P03) *cannot* match by design. The
   score could never have moved. Exercise 4.1 confirms the rest.
3. **Error analysis is missing.** Fixes come from an obstacle catalogue written upfront (LO-xx), not from
   counting observed failures. Nobody read the BA's process records next to the ground truth yet.
4. **Comprehension debt and over-delegation.** About 130k lines in 19 days with "no work myself". You
   can't review it, so you can't catch confident mistakes. Rating proposals doesn't teach harness building.
5. **Process overhead and context bloat.** Speckit (11 skills), constitution, PO agent, changelog,
   glossary sync, model tags, memory-as-tracker: much is Claude managing Claude, and it all competes for
   context. Three of the twelve spec-014 findings (F-10–F-12) are slips in the ceremony itself.
6. **Productization blind spot.** The chat runs on your personal Claude Code login, and a single eval run
   already costs $2–6 on toy portals.

**Concepts that help most:** eval method (noise, hold-out sets, judge calibration, metric validity, error
analysis) → context engineering → reading transcripts → outcome-first scoping.

**What to do next in the project:** freeze features for a few days; run each baseline 3–5×; spend 2
hours on `processes = 0 %` yourself; write hold-out ground truth by hand; prototype the rebuild eval; fix
`0/0 = 100 %`; add a calibrated judge for rules and processes.

## Files

| File | What |
| --- | --- |
| [01-evals-basics.md](01-evals-basics.md) | Evals vs tests, anatomy of an eval, good and bad examples |
| [02-ground-truth.md](02-ground-truth.md) | What ground truth is, how to write and review it |
| [03-metric-validity-and-noise.md](03-metric-validity-and-noise.md) | Is the number measuring the right thing? Is it noise? |
| [04-error-analysis.md](04-error-analysis.md) | Findings docs, transcripts and how to read them systematically |
| [05-llm-as-judge.md](05-llm-as-judge.md) | Theory and a concrete implementation for this harness |
| [06-outcome-first.md](06-outcome-first.md) | Steering the roadmap by the goal metric |
| [07-context-and-tools.md](07-context-and-tools.md) | What the agent sees and how tools shape it |
| [08-working-with-ai.md](08-working-with-ai.md) | Transcripts, comprehension debt, process overhead audit |
| [09-productization.md](09-productization.md) | Login vs API, cost per portal |
| [10-writing-evals.md](10-writing-evals.md) | The process of writing a new eval, step by step |
| [glossary.md](glossary.md) | Terms explained simply, with examples from this project |
