# 1. Evals vs tests: the basics

## The one-sentence difference

- A **test** checks that *code* does what you wrote it to do. Same input → same output, every time. It
  passes or fails.
- An **eval** measures how well a *non-deterministic system* (an LLM agent) achieves a *goal*. Same input →
  different output each run. It gives a **score with a spread**, not a pass/fail.

Tests ask "is it broken?". Evals ask "how good is it, and is it getting better?".

| | Test | Eval |
| --- | --- | --- |
| What is checked | Code | Behaviour of a model + harness |
| Repeatable? | Yes, exactly | No: every run differs |
| Result | Pass / fail | Score (e.g. 62 % ± 8) |
| One run is enough? | Yes | No: you need several (trials) |
| Who writes the expected answer | The developer, from the spec | A domain expert, from reality (ground truth) |
| Typical cost | Milliseconds, free | Minutes, dollars |
| When it "fails" | Fix the code | Look at transcripts first: the agent, the harness, the grader or the ground truth may be wrong |

## The three tiers in this repo

Pathfinder already has all three. Knowing which is which removes most of the confusion:

| Tier | Where | What it is |
| --- | --- | --- |
| Unit / integration tests | `pnpm test:fast`, `uv run pytest` | **Tests.** Deterministic code checks. |
| Gates | `apps/crawler/packages/gates/`, run in `pnpm test:slow` | **Deterministic tests of the harness** against the proving ground. No LLM decides anything: a scripted driver walks the portal and checks that the server records what it should (e.g. a `div` with an `onclick` becomes an action). Pass/fail. |
| Evals | `pnpm --dir apps/crawler eval` (`apps/crawler/scripts/eval-run.ts`), results in `data/evals/<portal>/` | **Evals.** The real crawler and BA agents run headless (`claude -p --agent crawler ...`), then `docs:evaluate` (`apps/crawler/packages/docs/src/evaluate.ts`) scores the documentation against ground truth. Score per category. |

Gates answer "can the harness handle a `div` click?". Evals answer "does the agent, using the harness,
actually document the portal?". A green gate set with a 0 % eval score means the machinery works and the
outcome doesn't.

## Anatomy of an eval

These are the words Anthropic uses in
[Demystifying evals for AI agents](https://anthropic.com/engineering/demystifying-evals-for-ai-agents),
mapped onto this project:

| Term | Meaning | In Pathfinder |
| --- | --- | --- |
| **Task** | One problem with a known good answer | "Document `reference-insurer` as guest" |
| **Trial** | One attempt at a task (one run) | One `pnpm eval` run → one JSON in `data/evals/reference-insurer/` |
| **Transcript** (trace) | Everything the agent saw and did in a trial | `~/.claude/projects/-home-dawid-projects-pathfinder-ai/<crawler_cli_session>.jsonl` |
| **Outcome** | The final state the agent produced | The BA records in the SQLite store |
| **Grader** | Code, model or human that scores the outcome | `evaluate.ts` (code grader) |
| **Ground truth** | The answer key the grader compares to | `apps/crawler/packages/reference-portal/ground-truth.json` |
| **Harness** | The code that runs tasks, collects transcripts and grades | `eval-run.ts` + `evaluate.ts` + `gates/src/eval.ts` |

### Three kinds of graders

1. **Code grader**: deterministic rules (exact match, regex, "route X was visited"). Fast, cheap, never
   flaky. Good for things with one right form: screens (route templates), fields (labels), constraints
   (`max_length: 5`). Bad for meaning: "the BA described the age rule correctly".
2. **Model grader (LLM as a judge)**: another LLM reads the output and answers a narrow question. Good
   for meaning. Must be checked against a human (section 5).
3. **Human grader**: you. Slowest, but it is the reference the other two are calibrated against.

Use the cheapest grader that measures the right thing. Pathfinder uses code graders for everything,
including rules and processes, which are semantic. That's the mismatch.

### Capability evals vs regression evals

- **Capability eval**: "can it do this at all?" Starts low and should climb. Processes at 0 % is a
  capability eval that never climbed.
- **Regression eval**: "did we break what worked?" Should stay near 100 %. Screens on `reference-insurer`
  (100 %) are a regression eval now.

Mixing the two in one baseline with one tolerance hides both signals.

### pass@k and pass^k

Because each trial differs:

- **pass@k**: at least one of k trials succeeded. "Can it ever do it?"
- **pass^k**: all k trials succeeded. "Can I rely on it?"

A crawler that reaches the legacy app in 1 of 5 runs has pass@5 = yes, pass^5 = no. For a BA tool that
someone will trust, pass^k (consistency) is what matters.

## Good and bad evals: examples

### Bad

1. **One run as the baseline.** `data/evals/proving-ground-bank/baseline.json` is a single run. The next
   run differs by ±20–40 points in `terms` with no code change. Any comparison against it is mostly noise.
2. **A score with nothing to score.** bank `rules: matched 0, total 0, pct 100`. It reads as "perfect",
   but means "not measured". It belongs in the report as `n/a`.
3. **A tiny answer key.** bank `screens 1/2`, `fields 0/2`. One record flips the score by 50 points. The
   number looks precise and isn't.
4. **A string match for meaning.** Ground-truth rule R01 matches any record that cites the right screen and
   contains "18" and "75". "Age is NOT limited to 18–75" passes. "Drivers must be adults up to 75" fails.
5. **An eval written by the system it grades.** The proving ground, its ground truth and the crawler fixes
   were all written by Claude. The eval can confirm what Claude already believed, not find what it missed.
6. **An eval of the wrong goal.** "Did the BA write 19 rule records?" measures activity. "Could someone
   rebuild the portal from these records?" measures the goal.

### Good

1. **Several trials, reported as mean ± spread.** "rules 48 % (min 31, max 56, n=5)".
2. **One narrow, binary question per check.** "Does any record state that the driver must be 18–75 on the
   calculation date? yes/no", graded by code where possible and by a calibrated judge where not.
3. **Ground truth written by a domain expert before the run**, from the real system, including the things
   that are hard to observe.
4. **A hold-out task** the builders never tuned against (a portal Claude has never seen).
5. **Every score links to evidence**: which records matched, which ground-truth items were missed, and the
   transcript, so a failure can be read and not only counted. `evaluate.ts` already lists misses and
   over-claims, which is good.
6. **Measures the user's goal end to end**: the rebuild eval (section 6).

## How to create good evals

1. **Start from error analysis, not from imagination** (section 4). Look at 20–50 real runs, find what goes
   wrong, write an eval for each frequent failure.
2. **Write the success criteria in plain language first**, then decide the grader. Anthropic's
   [Define success criteria](https://platform.claude.com/docs/en/test-and-evaluate/define-success) and
   [Develop tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests) pages walk
   through this.
3. **Pick the cheapest valid grader**: code where the answer has one form, judge where it's about
   meaning, human for calibration.
4. **Make each check binary.** "Pass/fail + a one-line reason" beats "rate 1–5". Scales drift.
5. **Run several trials** and keep the transcripts.
6. **Read the failures** before trusting the number.

### By hand or by chatting with Claude?

Both, with a clear split:

| Part | Who |
| --- | --- |
| What counts as success (the criteria) | **You.** That's your BA judgement, the thing the product is about. |
| Ground truth content | **You**, from the real portal (section 2). Claude may suggest candidates, but you verify each one against the portal and Claude never writes the hold-out set. |
| Labels for calibrating a judge | **You.** 40 pass/fail labels with a one-line reason each. |
| Grader code, JSON formatting, the harness, the report | **Claude.** Mechanical work. |
| Judge prompt | **Claude drafts, you calibrate** against your labels. |
| Reading failing transcripts | **You** (first passes), Claude can summarise later once you know what to look for. |

The rule: the parts that *define* "good" come from a human who knows the domain. The parts that
*compute* the score can be generated.

### How to review an eval

Ask these questions about each category:

1. **Does 100 % mean the goal is met?** Imagine a run that scores 100 %. Would a BA be happy? If not, the
   metric is incomplete.
2. **Can a bad output score well?** Try to write a fake record that matches. If it's easy (rule R01 with
   "18" and "75"), the grader is too lenient.
3. **Can a good output score badly?** Write a correct record in different words. If it fails, the grader is
   too strict.
4. **What is the noise?** Run it 5×. If the spread is bigger than the improvements you're chasing, you
   can't steer by it.
5. **Who wrote the answer key, and did they see the system's output first?** If yes, it's biased.
6. **How many items are behind the percentage?** Fewer than about 20 → report counts, not percentages.

## Exercises

- **1.1 Classify.** Go through `apps/crawler/packages/gates/src/catalogue.ts`, the categories in
  `evaluate.ts` and `gates/src/eval-checks.ts`. For each check write "test", "gate" or "eval", and for
  evals: code grader / judge / human, capability / regression.
- **1.2 Break the grader.** For ground-truth rule R01, write two fake BA records: one wrong that passes,
  one right that fails. That's question 2 and 3 above, done by hand.
- **1.3 Name the goal.** Write one paragraph: "MudPuppy succeeds when ...". Then check which eval
  category measures it. (Expected answer: none fully. See section 6.)

## Where in your process

- **Spec step (speckit-specify):** every spec gets a "Success measured by" line naming the eval category
  and expected change, e.g. "processes on reference-insurer from 0 % to ≥ 60 % (n=5)".
- **Close-out:** the item is done when the eval moved (with spread), not when the tasks are ticked.

## Resources

**Articles**
- Anthropic: [Demystifying evals for AI agents](https://anthropic.com/engineering/demystifying-evals-for-ai-agents). Start here. Tasks, trials, graders, pass@k, an 8-step roadmap.
- Anthropic docs: [Define success criteria](https://platform.claude.com/docs/en/test-and-evaluate/define-success) and [Develop tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests).
- Hamel Husain: [LLM Evals: Everything You Need to Know (FAQ)](https://hamel.dev/blog/posts/evals-faq/) and [What are LLM evals?](https://hamel.dev/blog/posts/evals-faq/what-are-llm-evals.html).
- Hamel Husain: "Your AI product needs evals", summarised by [Simon Willison](https://simonwillison.net/2024/Mar/31/your-ai-product-needs-evals).
- Hamel Husain: ["It's Hard to Eval" Is a Product Smell](https://hamel.dev/blog/posts/eval-smell).
- Humanloop: [Why your product needs evals](https://humanloop.com/blog/why-your-product-needs-evals).
- Lenny's Newsletter: [Building eval systems that improve your AI product](https://www.lennysnewsletter.com/p/building-eval-systems-that-improve).

**Video (free)**
- DeepLearning.AI + Arize: [Evaluating AI Agents](https://www.deeplearning.ai/short-courses/evaluating-ai-agents/), about 2h16m, 15 lessons with code. You watch them build and evaluate an agent step by step.
- Lenny's Podcast: *Why AI evals are the hottest new skill for product builders*, with Hamel Husain and Shreya Shankar (1h46m, on Lenny's YouTube channel; [episode notes](https://www.lennysnewsletter.com/p/why-ai-evals-are-the-hottest-new-skill)).
- Maven free lightning lesson: [The cold-start eval problem: evals for new AI products](https://maven.com/p/5fb214/the-cold-start-eval-problem-evals-for-new-ai-products). Very close to your situation: no real users yet.

**Paid**
- Maven: *AI Evals for Engineers & PMs* (Hamel Husain, Shreya Shankar). Live cohort, 4 weeks, recorded. List price was $4,200 at the time of the review ([course page](https://maven.com/courses/for-engineers/evals)). The most complete course on this topic; the free material above covers maybe 60 % of it.
