# 10. Writing a new eval: the process

The other modules explain the *concepts*. This one is the *order of work*: what you do, in what
order, and how you know each step is done. The *shape of the code* (folders, names) is in the
`create-eval` skill and `apps/crawler/evals/README.md`; this page doesn't repeat it.

Words follow Anthropic's eval vocabulary (G-33): **task**, **evaluation suite**, **trial**,
**grader**, **transcript**, **outcome**, **reference solution**. Plus ours: **ground truth**,
**baseline**, **tolerance**.

## The process at a glance

```
 0. Is it an eval?            non-deterministic behaviour → eval; fixed input/output → test
 1. Success in words          what outcome means "the agent did its job"
 2. Tasks                     the inputs that vary; 3–5 to start, from real failures
 3. Ground truth              the answer key, written independently of the agent
 4. Graders                   goal / guardrail / diagnostic; code first
 5. Build                     create-eval skill; --dry-run passes
 6. Validate the eval itself  reference solution scores ~100 %, a bad output scores low
 7. Trials                    3+ per task; measure the noise; set tolerances from it
 8. Baseline                  promote a representative, clean trial
 9. Use it                    after every change that could matter; read transcripts on a drop
10. Grow it                   every new failure becomes a task or a grader
```

Steps 0–4 happen on paper. You write code only in step 5. That's the point: an eval built before
you know what success means will measure the wrong thing very precisely.

## 0. Is it an eval at all?

| Question | Test (gate, unit test) | Eval |
|---|---|---|
| Is the thing being checked deterministic? | Yes: same input, same output | No: an LLM agent decides |
| Can it pass or fail on one run? | Yes | No: you look at scores over trials |
| Does it cost tokens? | No | Yes |

"The fence blocks `Write` outside the workspace" is a **test**. "The chat agent guides a BA to a
scoped process without asking needless questions" is an **eval**.

**Done when:** you can say in one sentence which agent behaviour is graded.

## 1. Write success in words

Before any task or number, write the outcome that means the agent did its job, from the user's
point of view (module 06, outcome first). Then split it into what you can check:

- **Goal**: what must be true at the end. For the BA: "every ground-truth process is documented
  with its steps and rules".
- **Guardrails**: what must never happen. "No portal password appears in any output."
- **Diagnostics**: what helps explain a bad score. "Did the crawl finish? How many relogins?"

Watch for a goal that can't be measured with the current setup. Module README §2: the crawler eval
runs in map mode only, so trace evidence never exists, and two of the five reference processes
*can't* match. Catch that kind of problem here, on paper.

**Done when:** you have 1–3 goal statements, the guardrails, and you can say what the north-star
number is.

## 2. Choose the tasks (the evaluation suite)

A task is one input with its success criteria. Here, a portal (plus a persona); for a chat eval, a
BA goal like "onboard portal X as persona client and scope process Y".

- **Start with 3–5.** Start small and grow the suite from real failures; a few well-chosen tasks
  with clear success criteria beat many vague ones. Each task costs real money per trial.
- **Take them from real failures**, not from imagination: findings docs, transcripts, things a BA
  complained about (module 04, error analysis). A task nobody has ever failed teaches little.
- **Cover both sides**: tasks where the agent *should* act and tasks where it *should not* (a
  portal area it must not touch, a question it must not ask). An eval with only "should" tasks
  rewards an agent that does everything.
- **Keep a hold-out**: one or two tasks you never look at while improving the agent, so you can
  check you didn't just tune to the suite (module 03).

**Done when:** each task has an id, its input, and one line of success criteria.

## 3. Write the ground truth

The answer key the graders compare against (module 02). Two ways, depending on who owns the system:

- **We own it** (proving ground, reference portal): write it from the source. We know which
  screens, fields and rules exist because we built them. Keep it next to the system, with a
  self-check test that fails when the system and the truth drift apart.
- **We don't own it** (a live portal): run the agent, then review its output by hand, correct
  every mistake, and save the corrected version in `evals/ground-truth/<task>.json`. **Never** save
  the agent's output unreviewed: its mistakes would become "correct", which is circular.

Then write a **reference solution** for at least one task: a hand-made output that should pass every
grader (e.g. BA records for all five processes). You'll use it in step 6.

**Done when:** every task has ground truth, and the parts you're unsure about are marked, not
guessed.

## 4. Design the graders

For each goal, guardrail and diagnostic from step 1, decide how it's checked:

| Kind | Use when | Cost | Folder |
|---|---|---|---|
| Code-based | The answer is exact: a route exists, a count is 0, a field has `max_length: 5` | Free, repeatable | `graders/code/` |
| Model-based (LLM as judge) | The answer is about meaning: "does this record state rule R-03 correctly?" | Tokens, some noise | `graders/model/` |
| Human | Labelling, calibrating a judge, spot checks | Your time | `graders/human/` |

Rules:

- **Code first.** Add a judge only for a category where you *showed* code gives wrong answers
  (false passes or false fails you found by reading outputs).
- **One narrow question per judge call**, yes/no plus a reason, against one ground-truth item.
  Never "rate this documentation 1–10" (module 05).
- **Calibrate before trusting**: label 20–30 items yourself, run the judge on them, measure
  agreement. Below ~90 %, fix the judge prompt or don't use it.
- Prefer grading the **outcome** (what's in the store at the end) over the path the agent took.
  Agents find valid paths you didn't plan.

**Done when:** each check from step 1 has a grader kind and a one-line description of how it decides.

## 5. Build it

Now code, following the `create-eval` skill: the `evals/` folder at the app root, tasks and
prompts first, then harness, graders, results, tests.

**Done when:** unit tests pass and `pnpm eval <task> --dry-run` passes for every task. The dry run
is free and catches setup problems (missing ground truth, vault key, workspace copy) before you pay
for a trial.

## 6. Validate the eval itself

The step people skip, and the reason `processes` stayed 0 % for weeks unnoticed. Before you trust
a score, check that the eval *can* give the right one:

1. **The reference solution scores ~100 %.** If your hand-made perfect output scores 0 %, the grader
   or the ground truth is broken, not the agent.
2. **A deliberately bad output scores low**: an empty store, or one with wrong values. If it still
   scores well, the grader is too lenient.
3. **Read the first trials' transcripts and outputs next to the ground truth** (module 04). For every
   grader verdict you disagree with, note whether it's a grader bug or an agent bug.
4. **Check the denominators**: a category with `0/0` must not count as 100 % (module 03).

**Done when:** you'd bet that a score change means a behaviour change.

## 7. Run trials and measure the noise

Agents are non-deterministic: the same code gives different scores. So:

- Run **at least 3 trials per task** before drawing conclusions (module 03).
- Look at the spread per category: if `rules` ranges 31–56 % over three trials of unchanged code,
  a 10-point drop later means nothing.
- Set `tolerances.json` from that spread: a drop smaller than the normal spread is not a regression.
- Write down the cost per trial; it decides how often you can afford to run the suite.

**Done when:** you know the normal spread of every goal score.

## 8. Promote a baseline

Pick the trial that stands for "how good the agents are today" and `--promote` it. A good baseline:

- finished normally (no budget cut, `crawler_completed`), with every guardrail at 0
  (promotion refuses otherwise);
- is typical, not the luckiest trial: take one near the middle of the spread from step 7;
- ran under the same conditions you'll compare against (model, timeouts).

**Done when:** `data/evals/<task>/baseline.json` exists for every task.

## 9. Use it

After any change that could affect behaviour (agent definition, skill, prompt, MCP tool, model):

1. Run the affected tasks (several trials if the change is subtle).
2. **No regression** → if the scores clearly improved beyond the noise, promote the new baseline.
3. **Regression** → don't argue with the number first; read the transcripts of the failing trial
   next to the baseline's. Each result stores `git_sha`, so `git diff <baseline sha> <trial sha>`
   shows what changed.
4. **A score you don't believe** → back to step 6: the eval may be wrong.

## 10. Grow it

- Every bug a user or you find in agent behaviour becomes a **task** (a new input) or a **grader**
  (a new check), so it can't come back unnoticed. This project logs bugs to the spec findings docs
  for exactly this.
- When the system under test changes, update its ground truth in the same commit.
- When a prompt or agent definition changes, old baselines measured a different agent. Re-baseline
  rather than comparing across the change.
- Retire tasks that every trial passes for months; they cost money and teach nothing (or move them
  to a cheaper, less frequent suite).

## Worked example: a chat agent eval (sketch)

| Step | For the chat agent |
|---|---|
| 0 | Eval: the agent chooses questions and tool calls |
| 1 | Goal: BA reaches a scoped process for the right portal and persona. Guardrail: no forbidden tool call, no write outside the workspace. Diagnostic: number of turns, questions asked |
| 2 | 3 tasks: "onboard proving-ground-bank as client, scope the transfer process"; one where the BA gives a portal that doesn't exist (should ask, not guess); one where the BA asks for a scan the agent must refuse |
| 3 | Ground truth: the expected end state per task (portal, persona, scoped process id), plus the tools that must and must not appear |
| 4 | Code: end state from `packages/workflow`, tool calls from the transcript. Model: "was each question to the BA necessary?" (only after calibration). Human: your labels for that judge |
| 5 | `apps/chat/evals/` per the skill; a scripted BA plays the user turns |
| 6–10 | As above |

## Exercises

- [ ] 10.1 For the existing crawler eval, write steps 1–4 on paper as if it didn't exist. Compare
  with what `apps/crawler/evals/` does. What is missing (hint: step 6, the reference solution)?
- [ ] 10.2 Write a reference solution for one reference-insurer process and grade it. Does it
  score? If not, you found a grader or ground-truth bug.
- [ ] 10.3 Run three trials of one task and set its tolerances from the spread.
- [ ] 10.4 Draft steps 0–4 of the chat agent eval above in your own words.
