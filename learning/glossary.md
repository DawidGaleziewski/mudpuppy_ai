# Glossary

Terms from this learning folder, explained simply, with an example from Pathfinder where possible.
Ask Claude to add any word you meet and don't know. Alphabetical.

---

**Agreement (judge–human agreement)**
How often an LLM judge gives the same verdict as you on the same items. The number that decides whether
a judge can be trusted. *Example:* you label 20 (rule, record) pairs; the judge matches you on 18 → 90 %
agreement. Always look at TPR and TNR separately too.

**Axial coding**
The second step of error analysis: grouping your free-text failure notes into categories. *Example:* the
notes "cited screens not steps" and "process record has no step evidence" become one category, "process
record cites wrong evidence kind".

**Baseline**
The stored result that new runs are compared against, to catch regressions. *Example:*
`data/evals/reference-insurer/baseline.json`. A baseline from one run is weak; take the mean of several.

**Capability eval**
An eval of something the system can't do well yet. The score starts low and should climb. *Example:*
`processes` (0 %).

**Circular evaluation**
When the system being graded (or the same model) also wrote the answer key or the grader. The eval then
confirms the system's own beliefs instead of testing them. *Example:* Claude built the proving ground,
wrote its ground truth and tuned the crawler on it.

**Claim markers**
Pathfinder's way of matching rules: a record must contain one of the listed phrases. *Example:* rule R01
matches records containing "18" and "75". Easy to fool (see metric validity).

**Code grader**
A deterministic check that scores output with rules, not a model. *Example:* `evaluate.ts` matching
screens by route template. Fast, cheap, never flaky; bad at meaning.

**Cohen's kappa**
Agreement between two raters, corrected for agreement by chance. From −1 to 1; above ~0.6 is
"substantial". *Example:* you and a colleague both label 40 records pass/fail. If 90 % are "pass", you'd
agree often by luck; kappa removes that luck.

**Comprehension debt**
The gap between how much code exists and how much of it a person really understands. Grows fast with AI
coding, and feels fine until something subtle breaks. *Example:* 130k lines in 19 days.

**Confidence interval (95 %)**
A range that likely contains the true average score. ≈ mean ± 1.96 × standard error. *Example:* rules
31, 0, 31, 56 → mean 29.5, interval about 7–52. Too wide to show small improvements.

**Confusion matrix**
A 2×2 table of your labels vs the judge's verdicts: true positives, false positives, false negatives, true
negatives. Shows *which way* a judge is wrong.

**Context engineering**
Choosing what goes into the model's context window at each step (instructions, tool results, history)
and what stays out. *Example:* R-24 slimmed known-state results, so the crawler's context stopped filling
with repeated page lists.

**Context rot**
Models get less accurate as the context grows, well before it's full. Irrelevant-but-similar text hurts
most. Reason to keep tool results and instructions short.

**Context window**
Everything the model can "see" in one step: system prompt, instructions, tools, history, tool results.

**Criteria drift**
You only find out exactly what "good" means while grading real outputs, so your criteria change as you
grade. Normal; version your ground truth and labels. (From Shankar et al.)

**Critique shadowing**
Hamel Husain's method for building a judge: a domain expert gives pass/fail plus a written critique for
real outputs; the critiques become the judge's examples, and the judge is checked against the expert.

**Error analysis**
Reading many real outputs by hand, noting what went wrong, grouping and counting the failures. Tells you
what to fix and which evals to write.

**Eval**
A measurement of how well a non-deterministic system (an agent) reaches a goal. Gives a score with a
spread, needs several runs. *Example:* `pnpm --dir apps/crawler eval reference-insurer`.

**Failure taxonomy**
The list of failure categories (with counts) that comes out of error analysis.

**False negative / false positive**
A judge or check says *fail* when the right answer was *pass* (false negative), or *pass* when it was
*fail* (false positive). *Example:* "Autocasco" vs "Autocasco (AC)" failing an exact match is a false
negative.

**Few-shot examples**
Worked examples put in a prompt to show the model what you want. For judges: your labelled cases with
your reasons.

**Gate**
In Pathfinder: a deterministic test that drives the real harness against the proving ground with a
scripted client (no LLM) and passes or fails. *Example:* "a `div` with an `onclick` becomes an action".
A test of the harness, not an eval of the agent.

**Golden dataset**
Another name for a curated set of inputs with ground-truth answers.

**Goodhart's law**
"When a measure becomes a target, it ceases to be a good measure." Optimising a number finds the cheapest
way to raise it, not necessarily the way you meant.

**Grader**
Whatever scores an output: code, an LLM judge or a human.

**Ground truth**
The answer key: what's really true about the thing being documented, written independently of the
system being graded. *Example:* `apps/crawler/packages/reference-portal/ground-truth.json` (19 screens,
19 rules, 5 processes, 10 terms).

**Harness**
The code around a model that gives it tools, runs it, records what happens and (for evals) grades it.
*Example:* the `pathfinder` MCP server is the crawler's harness; `eval-run.ts` + `evaluate.ts` is the eval
harness.

**Hold-out set**
Tasks and ground truth that nobody tunes against, used only to check that improvements are real and not
fitted to the development set. *Example:* a process on your work portal, written by you, that Claude
never reads during development.

**LLM as a judge (model grader)**
A model call that answers one narrow question about an output (pass/fail + reason). Only trusted after
checking it against human labels.

**Metric validity**
Whether a metric measures what you care about: a higher score really means a better outcome, and you can't
raise it without improving the outcome. *Example of invalid:* `rules 0/0 = 100 %`; `processes` that can't
match because the eval never traces.

**Noise (variance)**
How much scores differ between identical runs. *Example:* bank `terms` 20, 0, 40, 40, 30, 0.

**North-star metric**
The one number that best matches the user's goal, which all work is judged against.

**Open coding**
The first step of error analysis: writing free-text notes about what went wrong in each output, without
categories yet.

**Overclaim**
In Pathfinder: documentation stating as observed something a guest couldn't have observed. `evaluate.ts`
counts these.

**Overfitting / teaching to the test**
Improving a score on the specific cases you tuned on, without improving the general ability. *Example:*
crawler fixes tuned on the proving ground raise its scores more than they'd raise a real portal's.

**pass@k / pass^k**
pass@k: at least one of k trials succeeded ("can it ever?"). pass^k: all k succeeded ("can I rely on
it?").

**Position / verbosity / self-preference bias**
Judge biases: preferring the first answer shown, longer answers, or text in its own model's style.

**Precision / recall**
Recall: of all the true items, how many did the docs cover (what Pathfinder's category % mostly is).
Precision: of all the items the docs claim, how many are true (related to overclaims). You want both.

**Regression eval**
An eval of something that already works, to catch it breaking. Should stay near 100 %. *Example:*
`screens` on reference-insurer.

**Saturation (theoretical saturation)**
The point in error analysis where new outputs stop showing new failure types. Time to stop reading and
start fixing.

**Standard deviation / standard error**
SD: how much single runs typically differ from the mean. SE = SD / √n: how uncertain the mean is. More
runs → smaller SE.

**Test**
A deterministic check that code does what it was written to do. Same input, same output, pass/fail.
*Example:* `pnpm test:fast`.

**Thin end-to-end slice**
One complete path through the whole system (crawl → document → score), done well, before widening.

**TPR / TNR (true-positive / true-negative rate)**
For a judge vs your labels: TPR = of the items you passed, the share the judge passed. TNR = of the items
you failed, the share the judge failed. A judge that passes everything has TPR 100 %, TNR 0 %.

**Trace / transcript**
The full record of one agent session: prompt, model messages, tool calls and results, in order. *Example:*
`~/.claude/projects/-home-dawid-projects-pathfinder-ai/<session-id>.jsonl`. (In Pathfinder, "trace" also
means the crawler's trace mode and the R-17 run trace. Context tells which.)

**Trial**
One attempt at an eval task. Several trials per task are needed because agents are non-deterministic.
