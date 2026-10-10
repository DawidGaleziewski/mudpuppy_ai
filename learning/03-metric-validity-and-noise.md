# 3. Metric validity and noise

Two separate questions about any number on a dashboard:

1. **Validity: is it measuring the thing I care about?** (If it goes up, did the product get better?)
2. **Noise: if I measure again without changing anything, do I get the same number?**

A metric can fail either one. Most of your eval numbers today fail both a little.

## Metric validity

**A metric is valid when a higher score really means a better outcome for the user, and a lower one really
means worse.** It's invalid when you can raise the score without improving the outcome, or improve the
outcome without the score noticing.

Simple example outside AI: "lines of code written per day" is an invalid metric for developer
productivity. You can raise it by writing worse code.

### Goodhart's law

*"When a measure becomes a target, it ceases to be a good measure."* As soon as you (or Claude) start
optimising a number, the system finds the cheapest way to raise it, which is often not the way you meant.
Agents are very good at this, because they read the grader and the ground truth if you let them.

### How to find invalid metrics yourself: five tests

You don't need statistics for this. Apply each test to a category:

| Test | Question | How to run it |
| --- | --- | --- |
| **Empty test** | What does it say when there's nothing to measure? | Look for `total: 0`. |
| **Fake-pass test** | Can a wrong output score well? | Write a deliberately wrong record and run `docs:evaluate` on it. |
| **Fake-fail test** | Can a right output score badly? | Write a correct record in other words. |
| **Size test** | How many items stand behind the %? | Look at `total`. Fewer than ~10–20 → one item moves it a lot. |
| **Goal test** | If this were 100 %, would a BA be happy? | Imagine it, honestly. |

### Invalid metrics in this repo (to check yourself)

Open `data/evals/*/*.json` and `apps/crawler/packages/docs/src/evaluate.ts` and confirm each:

1. **`rules: {matched: 0, total: 0, pct: 100}` on proving-ground-bank.** Fails the empty test: a
   category with no ground truth reports perfect. It should be `n/a` and not compared to a baseline.
2. **Bank `screens 1/2`, `fields 0/2`, `constraints 0/2`.** Fails the size test. These categories can only
   be 0, 50 or 100.
3. **Rules via `claim_markers`** (`"18"`, `"75"` for R01). Fails the fake-pass test: any record on that screen
   containing both numbers passes, even if it says the opposite. Already noted as F-13@004 ("one claim
   marker is enough to match a rule (lenient scores)") and parked in R-36.
4. **Terms by exact normalised string** (`normalise(term_verbatim) === normalise(term)`). Fails the
   fake-fail test: `"Autocasco"` vs ground truth `"Autocasco (AC)"` is a miss.
5. **Processes by first + last route in cited evidence.** Fails the fake-fail test: a correct process
   record that cites screens instead of `process`/`process_step` evidence scores 0. Worse, the eval
   (`apps/crawler/evals/`) runs the crawler only in map mode, so no trace evidence ever exists, and processes ending
   in a result (P02, P03 on the reference portal) can't match at all. The score could never move. Confirm it
   in exercise 4.1.
6. **`crawl_screens` on the proving ground** after tuning the crawler on the same proving ground. Fails
   the goal test in a subtler way: it measures "handles these portals", not "handles legacy portals".

None of these mean the evaluator is bad work. It's a solid first version. They mean the numbers need
reading before they're trusted.

## Noise

An agent run is a random draw. Run the same eval twice on the same commit, and the scores differ. So one
run tells you roughly where the score is, never exactly.

### Your own data (same portal, nearby commits)

| Portal | Category | Runs (chronological) |
| --- | --- | --- |
| proving-ground-bank | terms | 20, 0, 40, 40, 30, 0 |
| proving-ground-bank | obstacles | 33, 30, 40, 33, 37, 43 |
| reference-insurer | rules | 31, 0, 31, 56 |
| reference-insurer | fields | 0, 0, 89, 96 |

Some of these changes are real (code changed between runs), but you can't tell which ones, because no
commit was measured more than once. The tolerances in `tolerances.json` (5–15 points) are smaller than the
noise (up to 40 points), so the regression check fires on luck and misses real drops.

### What to do about it

1. **Run each configuration several times.** 3 is a minimum, 5 is better. Report **mean, min and max**
   (or mean ± standard error).
2. **Compare distributions, not single runs.** "Before: 31, 0, 31 (mean 21). After: 56, 50, 62 (mean 56)"
   is a real improvement. "Before 31, after 56" might not be.
3. **Set tolerances from measured noise.** If a category swings ±20 between identical runs, a tolerance
   of 5 is meaningless.
4. **Keep the eval cheap enough to repeat.** At $2–6 per run, 5 runs is $10–30 per measurement. That's
   another reason to keep a small, fast eval for daily work and the full one for close-out.
5. **Fix the seed of what you can.** The portal, the persona data and the model version are under your
   control; keep them fixed while you compare.

### A little statistics (just enough)

- **Mean**: the average score over n runs.
- **Standard deviation (SD)**: how much single runs typically differ from the mean.
- **Standard error (SE)** = SD / √n: how uncertain the *mean* is. More runs → smaller SE.
- **95 % confidence interval** ≈ mean ± 1.96 × SE. If the "before" and "after" intervals overlap a lot,
  you haven't shown a change.

Example: rules 31, 0, 31, 56 → mean 29.5, SD ≈ 23, SE ≈ 11.5 → interval ≈ 7 to 52. That's how little
four runs can tell you when the noise is this high.

Anthropic's paper [Adding Error Bars to Evals](https://arxiv.org/pdf/2411.00640) (Evan Miller) is the
reference here; the [Anthropic summary page](https://anthropic.com/research/statistical-approach-to-model-evals)
is shorter.

## Exercises

- **3.1 Measure the noise.** Pick `reference-insurer` (about $5 per run). Run
  `pnpm --dir apps/crawler eval reference-insurer` 5× on the same commit without changing anything (one
  at a time, see R-40: evals share your usage quota). Put the scores in a table, compute mean, min, max per
  category. Compare the spread with `tolerances.json`. Ask Claude to write the small script that
  aggregates the JSON files, but compute one category by hand to check it.
- **3.2 Audit the metrics.** Run the five tests above on each category. Write one line per category:
  "valid / invalid because ... / fix: ...".
- **3.3 Fix the empty case.** Change the report so `total: 0` gives `n/a` and is skipped in comparisons.
  (Small code task; let Claude do it once you have written down why.)

## Where in your process

- **Baselines (`--promote`)**: only from ≥ 3 runs, storing all of them. The baseline is the mean, the
  tolerance is derived from the spread.
- **Feature close-out**: "rules 21 → 56 (n=3 each)" goes in the changelog, not a single number.
- **Roadmap**: R-40 (eval robustness) already exists; this section is its "why". Consider putting it
  before R-37/R-38.

## Resources

- Anthropic research: [A statistical approach to model evals](https://anthropic.com/research/statistical-approach-to-model-evals) and the paper [Adding Error Bars to Evals](https://arxiv.org/pdf/2411.00640).
- Anthropic: [Demystifying evals for AI agents](https://anthropic.com/engineering/demystifying-evals-for-ai-agents). The pass@k / pass^k section deals with non-determinism.
- [The Problem with Metrics is a Fundamental Problem for AI](https://arxiv.org/pdf/2002.08512) (Thomas & Uminsky). Goodhart's law applied to AI, readable.
- Klaviyo Data Science podcast: [Evaluating AI Models: a seminar with Evan Miller](https://medium.com/klaviyo-data-science/klaviyo-data-science-podcast-ep-56-evaluating-ai-models-a-seminar-feat-evan-miller-2076a8fdf647). The error-bars paper explained in conversation.
- Hamel Husain: [Evals FAQ](https://hamel.dev/blog/posts/evals-faq/). Several answers cover "why is my metric lying to me".
