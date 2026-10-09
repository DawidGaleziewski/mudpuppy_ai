# 4. Error analysis

## What it is

**Error analysis means reading many real outputs by hand, writing down what went wrong in each, grouping
those notes into failure types, and counting them.** The counts tell you what to fix first and which evals
to write.

It's the step people skip, because building feels more productive than reading. Hamel Husain calls it
"the most important activity in evals": you can't write a good eval for a failure you haven't seen.

## The three moves

1. **Open coding (journaling).** Read one transcript or output. Write a free-text note about the *first*
   thing that went wrong, in your own words. Don't use categories yet. Example note: "BA wrote a process
   record for the OC calculator but cited only screen states, no trace steps."
2. **Axial coding (grouping).** After 20–30 notes, group similar notes into categories, giving you a
   **failure taxonomy**. Example categories: "process record cites wrong evidence kind", "trace never
   started", "crawler stopped at login", "term written in English instead of verbatim Polish".
3. **Count.** How many failures in each category? Fix the biggest category first. Write an eval (code
   check or judge) for each category that matters.

Keep reading new outputs until new ones stop showing new categories ("theoretical saturation"). Hamel's
rule of thumb is about 100 traces for a mature product. For you, 20–30 per agent is a good first round.

## Your questions, answered

### Where are the findings docs?

`specs/<NNN>/findings.md`, one per spec since spec 008:

```
specs/008-screenshots-wireframes/findings.md
specs/009-legacy-proving-ground/findings.md
specs/010-acp-chat-orchestrator/findings.md
specs/011-portal-onboarding/findings.md
specs/012-maintainability/findings.md
specs/013-token-usage/findings.md
specs/014-eval-baselines/findings.md
specs/015-crawler-hardening/findings.md
```

Each finding is `## F-NN <title> (fixed / open / observation)`. They're a **bug log**: what broke while
building, plus eval ideas (your "log every bug for evals" rule). That's good, and a form of error analysis.
But it records failures that Claude happened to notice while building, not a systematic sample of agent
outputs. Error analysis is the systematic version.

### Where are the transcripts, and what are they?

A **transcript** (also called a trace) is the complete record of one agent session: the prompt, every
message the model wrote, every tool call with its arguments, every tool result it got back, in order. It's
the only place where you can see *why* the agent did what it did.

In this project they live in three places:

| What | Where | How to look at it |
| --- | --- | --- |
| Eval agent sessions (crawler and BA, headless) | `~/.claude/projects/-home-dawid-projects-pathfinder-ai/<session-id>.jsonl` where the id is `runs.crawler_cli_session` / `runs.ba_cli_session` in the eval JSON | One JSON object per line. `jq` or ask Claude to render it as readable Markdown (exercise 4.2). |
| Eval outputs (the BA records, the crawl) | `/tmp/pf-eval-<portal>-XXXXXX/data/db/sandbox.sqlite` (a fresh workspace per eval run; it survives until `/tmp` is cleaned) | Open with `sqlite3`, or re-run the eval with `--in-place` so it lands in the dashboard. |
| Server-side trace of a crawl (calls, phases, decisions, requests) | Dashboard → run page → Trace (R-17) | http://127.0.0.1:8765/runs/<run_id>. The agent's own messages appear there only after `pnpm --dir apps/crawler trace:import-agent`. |
| Your own development sessions with Claude Code | Same folder as the eval sessions, one `.jsonl` per session | Useful for "why did Claude build it this way". |

One gap: the eval JSON records the session ids but **not the workspace folder**, so finding the matching
`/tmp/pf-eval-*` for a result means comparing timestamps. Recording `workspace` in the result would make
error analysis much easier. (A small, good first task.)

### What role do they play?

- **Scores tell you *that* something failed. Transcripts tell you *why*.** "processes 0 %" could be the
  crawler never tracing, the BA never writing process records, the BA citing the wrong evidence, or the
  grader matching wrongly. Only the transcript and the records separate these.
- **They are the raw material for evals.** Each frequent failure category you find becomes a check.
- **They show harness problems.** Huge tool results, confusing error messages, tools the agent misuses:
  all visible only in transcripts. R-24 (token cost) was found exactly this way.

## Exercises

### 4.1 Why is `processes` 0 %? (about 2 hours, by hand)

The highest-value two hours in this whole document.

1. Take the latest reference-insurer eval: `data/evals/reference-insurer/2026-10-09T00-31-08-390Z.json`.
   Note its `runs.ba_session` and `runs.ba_cli_session`.
2. Find its workspace: `ls -ld --time-style=full-iso /tmp/pf-eval-reference-insurer-*` and pick the one created at that time.
3. List the BA's process records:
   `sqlite3 /tmp/pf-eval-reference-insurer-XXXX/data/db/sandbox.sqlite` and look at the doc record
   tables for kind `process` (ask Claude for the exact query; reading the schema in `data/schema/` is also a good exercise).
4. Open `apps/crawler/packages/reference-portal/ground-truth.json` → `processes` (5 of them).
5. Read the matching rule in `apps/crawler/packages/docs/src/evaluate.ts` (around line 340): a process
   counts only if a `process` record cites `process` or `process_step` evidence whose routes contain both
   `first_route` and `last_observable_route`, or is flagged `until_boundary` / not observable while citing
   `first_route` (for processes not ending in a result).
6. For each of the 5 ground-truth processes, write one line: is there a BA record for it? What does it
   cite? Why didn't it match?
7. Decide: **grader problem** (the records are right but don't match), **BA problem** (records missing
   or wrong), **crawler problem** (no traces were run, so there's nothing to cite), or **ground-truth
   problem**.

**A head start (checked while writing this, 2026-10-09):** `apps/crawler/scripts/eval-run.ts` runs one
crawler session **in map mode only** and then one BA session (see `PROMPTS` around line 147). No trace run
happens, so no `process_step` evidence exists. Of the 5 reference processes, P02 and P03 end in a
`result` and can *only* match through traced evidence, so they're **impossible by design** in the current
eval. P01, P04 (mutation) and P05 (login wall) can only match if the BA writes a process record flagged
`until_boundary` / not observable that cites the first route. Your job in this exercise: confirm this in the
records, and check whether the BA writes such flagged records at all. If it doesn't, `processes = 0 %` is
mostly a property of the eval pipeline, not of the BA. That's a perfect example of a metric-validity
problem (section 3): the score could never have moved, whatever the agents did.

Only after this, write the R-39 spec.

### 4.2 Open-code 20 failures

1. Ask Claude for a small script that renders a session `.jsonl` as readable Markdown (one heading per
   turn, tool calls with arguments, tool results shortened to 30 lines). Put it in `learning/tools/`.
2. Pick 5 eval sessions (mix crawler and BA, mix portals).
3. Read each one. For every place where something went wrong, write a one-line note in
   `learning/notes/open-coding.md`: session id, turn number, what happened. Aim for 20 notes.
4. Group them into 4–8 categories. Count. Write the table:

   | Category | Count | Example | Fix idea | Eval idea |
   | --- | --- | --- | --- | --- |

5. Compare your table with the roadmap order. Does R-37/R-38 (query parameters, redirects) address a big
   category? Does anything big have no roadmap item?

### 4.3 Look at the BA output like a customer

Export the docs from one eval run (`docs:export`) and read the SRS as if you were the client paying for
it. Write down the first 10 things that annoy you. That's open coding of the final outcome instead of the
transcript.

## Where in your process

- **Before writing any spec that aims to improve agent quality**: 1–2 hours of error analysis, and the
  spec cites the failure counts.
- **After every eval run you care about**: read at least the failures in one transcript. 15 minutes.
- **The findings docs**: keep them, but add a section per spec, "error analysis", with the failure table.
- **Weekly**: one transcript, end to end (section 8).

## Resources

**Articles**
- Hamel Husain: [Why is error analysis so important, and how is it performed?](https://hamel.dev/blog/posts/evals-faq/why-is-error-analysis-so-important-in-llm-evals-and-how-is-it-performed.html). Short and exact.
- Hamel Husain: [Automating Error Analysis](https://hamel.dev/notes/llm/ai-product-engineering/evals-error-analysis.html). What can and can't be handed to an LLM.
- Atla: [What works (and what doesn't) when automating error analysis](https://atla-ai.com/post/automating-error-analysis).
- Alex Strick van Linschoten: [Error analysis to find failure modes](https://alexstrick.com/posts/2025-05-23-error-analysis-to-find-failure-modes.html). A practitioner's worked example: good for seeing it done.
- Hamel Husain: [A Field Guide to Rapidly Improving AI Products](https://newsletter.eng-leadership.com/p/guide-to-rapidly-improving-ai-products). Includes "build a simple data viewer", exactly exercise 4.2 step 1.
- ChatPRD "How I AI": [Hamel Husain's guide to AI evals with error analysis](https://chatprd.ai/how-i-ai/hamel-husains-guide-to-ai-evals-with-error-analysis).

**Video (free)**
- Vanishing Gradients, [episode 60](https://vanishinggradients.fireside.fm/60): Hamel Husain on error analysis, with a live demo (also on YouTube). **Best "watch someone do it" pick for this section.**
- Aakash Gupta: [How to Do AI Evals Step-by-Step with Real Production Data](https://www.aakashg.com/hamel-shreya-ai-evals-step-by-step/). A tutorial walk-through of open and axial coding on real traces.
- Lenny's Podcast with Hamel and Shreya ([notes](https://www.lennysnewsletter.com/p/why-ai-evals-are-the-hottest-new-skill)), 1h46m on YouTube. They screen-share an error analysis.

**Paid**
- Maven *AI Evals for Engineers & PMs* ([page](https://maven.com/courses/for-engineers/evals)): error analysis is the core of the course.
