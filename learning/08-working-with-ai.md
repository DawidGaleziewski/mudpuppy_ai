# 8. Working with AI: transcripts, comprehension and process

Three related habits: **look at what the model actually does** (transcripts), **understand what you
own** (comprehension debt), and **keep the process as light as the work allows** (overhead).

## 8a. Reading transcripts and knowing how models fail

Scores and summaries are second-hand. A transcript shows what the model saw and decided, turn by turn.
Reading them regularly builds the intuition that harness building depends on: you start to predict where
an agent will go wrong before it does.

### Typical failure modes to look for

| Failure | What it looks like | Where it could show up here |
| --- | --- | --- |
| **Instruction overload** | Long prompt, some rules quietly ignored | Crawler prompt has ~20 rules; check which ones are broken in transcripts |
| **Stopping early / claiming done** | "Finished" with work left | Crawler ending with frontier items pending (the reason for `FRONTIER_NOT_EMPTY`) |
| **Sycophancy** | Agrees with you, praises your idea, follows a bad instruction | "Propose, user rates": Claude's proposals are shaped by what it expects you to like. Ask it to argue *against* its own proposal |
| **Grading itself leniently** | Its own work "looks good" | Claude writing and judging the proving ground (section 2) |
| **Gaming the check** | Changes the test or the matcher instead of the behaviour | Watch diffs that touch `evaluate.ts`, ground truth or gates in the same commit as the fix |
| **Lost in long context** | Forgets an early instruction or fact late in a session | Long BA sessions, long development sessions |
| **Confident wrong summary** | The final report says something the transcript doesn't support | Compare an agent's "Return" summary with what the transcript shows |

## 8b. Comprehension debt and delegation

**Comprehension debt** is the gap between how much code exists and how much of it you understand. Unlike
technical debt, it doesn't feel like a problem. Everything passes, until something subtle breaks and
nobody can say why. At about 130k lines in 19 days with "no work myself", this project carries a lot of it.

You don't need to understand every line. You need to understand the parts that **decide whether the
product works**:

1. The crawler agent prompt (`.claude/agents/crawler.md`) and the BA skill (`.claude/skills/ba-practice/SKILL.md`)
2. The eval runner (`apps/crawler/evals/`) and grader (`apps/crawler/packages/docs/src/evaluate.ts`)
3. The page pipeline order (`apps/crawler/packages/mcp-server/src/runtime/pipeline/process-page.ts`)
4. The safety classifier (what's refused and why)

### Delegation, deliberately

| Do it yourself (to learn and to judge) | Delegate |
| --- | --- |
| Success criteria, ground truth, judge labels | Grader and harness code |
| First reading of transcripts, error analysis | Scripts that render and count transcripts |
| Agent prompts' *intent* (what the agent must and must not do) | Wording polish, formatting |
| Reviewing any diff to the four core parts above | Templates, migrations, UI, docs |

### Habits that pay off

- **Predict, then read.** Before opening a file Claude wrote, write down what you expect it to do. The
  differences are where your understanding is wrong (or the code is).
- **Explain-back.** Ask Claude: "quiz me on how `evaluate.ts` matches processes; don't explain, ask". Five
  questions. Wrong answers show the gaps.
- **Hand-write one small piece per feature.** A judge prompt, one eval check, one tool result format. Then
  let Claude review *your* code.
- **Ask for the opposing view.** "What's the strongest argument against this plan?" Use it especially when
  you're about to rate proposals.

## 8c. Process overhead: what to actually do

You asked whether to compress, delete or review everything. Short answer: **don't rewrite or delete
specs. They're history, and cheap when nobody loads them.** The cost of process is in three places:

1. **What gets loaded into every session** (CLAUDE.md, memory, skill and agent descriptions, the roadmap
   when the PO agent works).
2. **Steps every item must go through** regardless of its size.
3. **Manual steps that could be a check.** Three of twelve spec-014 findings (F-10, F-11, F-12) are slips in
   the ceremony itself, a sign that some steps should be automated or dropped.

### The audit (exercise 8.3)

For each piece of process, answer: *what failure has it prevented in the last two weeks?* Then decide
**keep, shrink, automate or drop**. The table below is my proposal, to rate, not a decision:

| Piece | What it costs | Proposal |
| --- | --- | --- |
| Full speckit flow (specify → clarify → plan → tasks → analyze → implement) | ~1,000 lines of docs per item | **Shrink by size**: full flow for items over ~2 days or with schema/contract changes; a one-page "lite" spec (goal metric, scope, tasks) for the rest |
| `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `checklists/` per spec | Writing + review time | **Only when relevant** (schema change → data-model; new tool/API → contract) |
| `roadmap.md` (72 KB, mostly notes on done items) | ~18k tokens whenever it's read | **Split**: `roadmap.md` = active + next 5 (one screen); `roadmap-archive.md` = done items and their notes; `parking.md` = "to discuss" ideas |
| Memory files used as project trackers (R-24/R-28/R-29... state) | Loaded every session | **Move** project state to the roadmap/session dumps; keep memory for preferences and lasting facts |
| Glossary sync at every close-out | Manual step, slipped once (F-10) | **Automate**: a test that fails when a new term has no glossary entry, then drop the manual step |
| Changelog skill before merge | Manual step | **Keep** but generate the draft from the squash commit message |
| `code-reviewer` agent at close-out | One agent run | **Keep**: it finds real issues |
| `[opus]/[sonnet]/[haiku]` task tags | Small | **Keep only if** you still run tasks on different models |
| Constitution (200 lines, several amendments) | Read by speckit steps | **Keep**, and do R-42 (rules that are wrong for how Pathfinder is used) |
| Findings docs | Writing time | **Keep**, add an "error analysis" table per spec (section 4) |
| Session dumps | Small | **Keep** |

### How to run the audit

1. Rate the table above (keep / shrink / automate / drop), adding pieces I missed. 30 minutes.
2. Run `/context` in a fresh session before and after (section 7.2) to see the difference in startup tokens.
3. Try the lite flow on the next *small* item. Afterwards: did anything go wrong that the full flow would
   have caught? If not, the lite flow is the default for that size.
4. Write the result into CLAUDE.md as a size rule ("items under 2 days: lite spec").

## Exercises

- **8.1 Read two transcripts end to end**: one crawler, one BA, from the same eval run. For each, list:
  rules from the prompt that were broken, places where a tool result was confusing, and whether the final
  "Return" matches what happened. 1–2 hours. Repeat weekly with one transcript.
- **8.2 Read `evaluate.ts` yourself** (about 700 lines). Write in your own words, half a page: how each
  category is matched, and one way each can be fooled. Then ask Claude to check your summary.
- **8.3 The process audit** above.

## Where in your process

- **Weekly**: one transcript (30 min).
- **Per feature**: one hand-written piece, and you review any diff to the four core parts.
- **Per roadmap review (R-41)**: re-run the process audit table.

## Resources

**Articles**
- Addy Osmani (O'Reilly Radar): [Comprehension debt: the hidden cost of AI-generated code](https://www.oreilly.com/radar/comprehension-debt-the-hidden-cost-of-ai-generated-code/).
- Birgitta Böckeler (martinfowler.com): [Understanding Spec-Driven-Development: Kiro, spec-kit, and Tessl](https://www.martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html). An experienced engineer's honest take on spec-kit, including the overhead question. **Very relevant to 8c.**
- Anthropic: [Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices). CLAUDE.md, explore-plan-code, verification.
- Anthropic: [Effective context engineering for AI agents](https://anthropic.com/engineering/effective-context-engineering-for-ai-agents). Why fewer, sharper instructions work better.

**Video**
- The Pragmatic Engineer: [Building Claude Code with Boris Cherny](https://newsletter.pragmaticengineer.com/p/building-claude-code-with-boris-cherny). How the Claude Code lead works with agents day to day.
- Karpathy, [Software Is Changing (Again)](https://www.youtube.com/watch?v=LCEmiRjPEtQ). "Keep the AI on a leash", partial autonomy, and why human verification speed is the bottleneck.
- *Prompting for Agents*, Code w/ Claude 2025 (Anthropic YouTube channel). Watch how they debug an agent by reading its behaviour.
