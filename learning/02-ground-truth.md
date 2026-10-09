# 2. Ground truth

## What it is

**Ground truth is the answer key: what is really true about the thing being documented, written down
independently of the system you're grading.** The grader compares the agent's output to it.

In a school exam, the exam is the task, the student's answers are the output, and the teacher's answer
sheet is the ground truth. If the student wrote the answer sheet, the exam measures nothing.

In Pathfinder, the "thing" is a portal, and the ground truth lists what a perfect BA would document:

```json
// apps/crawler/packages/reference-portal/ground-truth.json (shortened)
{
  "screens":   [{ "id": "S09", "route_template": "/kalkulator/kierowca", "guest_visible": true }],
  "rules":     [{ "id": "R01",
                  "statement": "The driver must be between 18 and 75 years old on the calculation date.",
                  "anchor": { "screen": "S09", "label": "Data urodzenia" },
                  "guest_observable": true,
                  "claim_markers": ["18", "75"] }],
  "processes": [{ "id": "P01", "name": "Oblicz składkę OC/AC",
                  "steps": ["/kalkulator/pojazd", "/kalkulator/kierowca", "/kalkulator/opcje",
                            "/kalkulator/wynik", "/kalkulator/zakup"],
                  "first_route": "/kalkulator/pojazd", "last_observable_route": "/kalkulator/wynik",
                  "ends_with": "mutation" }],
  "terms":     [{ "id": "T02", "term": "Autocasco (AC)", "lang": "pl" }]
}
```

The reference portal has 19 screens, 19 rules, 5 processes and 10 terms. The proving ground's ground
truths live in `apps/proving-ground/ground-truth/{bank,insurer,shop}.json`. The format is described in
`specs/004-ba-documentation/contracts/ground-truth.md` and `specs/009-legacy-proving-ground/contracts/ground-truth-v2.md`.

## Why it matters which way it was made

The ground truth's value comes from being **independent**: written by someone who knows the truth, without
seeing the agent's output, and without knowing how the grader matches.

In this repo:

| Ground truth | Portal written by | Ground truth written by | Independent? |
| --- | --- | --- | --- |
| reference-insurer | Claude | Claude | No: the same model built the portal, the key, the agents and the grader |
| proving-ground bank / shop / insurer | Claude | Sonnet subagents (R-25, 2026-10-05) | No, and the crawler was then fixed against exactly these portals |
| liveinsurer, your work portal | Real company | Nobody yet | (This is where a hold-out set should come from) |

That's **circular evaluation**: the system is graded against its own idea of the answer. It can tell you
the plumbing works (useful!), but not whether the agent finds what a human BA would expect, because the
same blind spots sit in both the answer and the key.

The second problem is **teaching to the test** (overfitting): when you fix the crawler until the
proving-ground score rises, the score stops measuring "handles legacy portals" and starts measuring
"handles these three portals". bank `crawl_screens` 36 % → 91 % after R-28 is real progress on those
portals, but you don't know how much transfers.

The fix is a **hold-out set**: ground truth for portals that nobody tuned against, written by you, kept
away from Claude, and run rarely (e.g. once at each close-out), so it stays a fair test.

## You should write it, and here is how

You are the domain expert: you know what a BA would expect from documenting an insurance portal. That
knowledge is exactly what the ground truth must hold.

### Step by step

1. **Pick a portal Claude has never seen in this repo.** Options, best first:
   - One process on your work staging portal (you know it, it's legacy, it's the real use case).
   - One process on liveinsurer (already configured, compliance signed off).
   - A small open-source web app you run locally (no legal issues, fully controllable).
2. **Pick small, not complete.** One business process end to end is enough to start: 4–8 screens,
   their forms, 5–10 rules, the terms on those screens. A small key you trust beats a big one you don't.
3. **Walk it yourself in the browser, before running the agent.** Write down, in a plain text file:
   - Each screen: its URL pattern and what it is for.
   - Each field: label as shown, required or not, limits you can *prove* by trying (enter 17 as age → error).
   - Each rule: one sentence, plus *how you know* (tried it, read the help text, saw the error).
   - The process: the ordered screens, where it ends (result, payment, login wall).
   - Terms: the portal's own words a BA must keep verbatim.
   - **Mark what a guest can't observe** (`guest_observable: false`). This is how you catch the BA
     claiming things it couldn't have seen (over-claims).
4. **Write the "how to match" note per item, in plain words.** "Any record that says the minimum age is
   18 and the maximum 75, for the driver, counts." This sentence later becomes either a code check or the
   judge's question.
5. **Only then let Claude turn your notes into the JSON format.** Check the JSON against your notes.
6. **Freeze it.** Commit it under a hold-out folder that's clearly marked, and tell Claude in CLAUDE.md
   never to read or edit that folder except to run the eval. (Claude may still need it for the grader to
   run, but not for development.)
7. **Review it again 3–4 days later**, without looking at your first version's reasoning. Where the two
   passes disagree, the item is unclear. Fix or drop it.

### How to pick what to write

Prioritise by "what would hurt the migration most if the docs missed it":

1. **Processes and their order**: the unit of brownfield migration (your own words in `user_input/redesign/readme.md`).
2. **Business rules that change outcomes**: eligibility, limits, prices, branching.
3. **Data fields and constraints**: what the new system must accept and reject.
4. **Terms**: needed, but cheap to get right.
5. **Screens**: the easiest, and already at 100 % on the reference portal.

Write fewer screens and more rules/processes, because that's where the scores are low and where the value is.

### Should Claude help?

Claude can help in two safe ways:

- **Formatting**: turn your notes into JSON.
- **Challenging**: "here are my 8 rules for this process; which observations would contradict them?" It
  may point out something you missed. You then verify on the portal and decide.

Claude should **not** propose the items for a hold-out set from crawling or reading the portal. Then the key
contains what Claude can find, and misses what it can't, which is the thing you want to measure.

### How to review ground truth

- **Each item has a "how I know" line.** No source → drop it.
- **Each item is checkable.** "The form is user-friendly" isn't; "postcode must be NN-NNN" is.
- **Counts are big enough.** Fewer than about 10 items per category → report counts, not percentages.
- **Agreement with someone else.** If a colleague (another BA) writes ground truth for the same process,
  compare the two. Items only one of you wrote are either a miss or an ambiguity. For pass/fail labels,
  agreement is measured with Cohen's kappa (see [glossary](glossary.md)).
- **Stays true.** Portals change. Date the file (`"today"` is already in the reference ground truth) and
  re-check it before each important run.

## Exercises

- **2.1 Hold-out ground truth.** Pick one process (work portal or liveinsurer). Do steps 1–7 above. Target: 1
  process, 5–8 screens, 8+ rules, all fields, 10 terms. Time box: one evening for the walk, 30 min for the
  review three days later.
- **2.2 Review the existing key.** Open `apps/crawler/packages/reference-portal/ground-truth.json`.
  For each rule: is the `statement` checkable on the portal? Do the `claim_markers` accept wrong answers
  or reject right ones? Note what you'd change.
- **2.3 Run the agent on your hold-out portal** 3× and score it. Compare with the proving-ground scores.
  The gap between the two is roughly how much the proving-ground scores are inflated by tuning.

## Where in your process

- **Before any crawler/BA feature spec**: the hold-out score is the "before" number.
- **At close-out**: run the hold-out eval (3 trials) as the last check. Proving-ground evals remain your
  daily development signal.
- **CLAUDE.md**: add a rule that the hold-out folder is read-only for Claude and never used for tuning.

## Resources

**Articles**
- Hamel Husain: [A Field Guide to Rapidly Improving AI Products](https://newsletter.eng-leadership.com/p/guide-to-rapidly-improving-ai-products). Domain experts write the criteria; why synthetic data is useful but must be checked.
- Shreya Shankar et al.: [Who Validates the Validators?](https://arxiv.org/pdf/2404.12272) (paper). Shows "criteria drift": you only learn what "good" means by grading outputs, so your ground truth will change as you grade. That's normal; version it.
- Eugene Yan: [Evaluating the Effectiveness of LLM-Evaluators](https://eugeneyan.com/writing/llm-evaluators/). Long, but the alignment part explains why human labels are the anchor.
- Surge AI: [Inter-rater reliability: understanding Cohen's kappa](https://surgehq.ai/blog/inter-rater-reliability-metrics-understanding-cohens-kappa). How to check that two people (or you twice) agree.
- Tian Pan: [The LLM-as-Validator Antipattern: circular quality gates](https://tianpan.co/blog/2026-05-02-llm-as-validator-antipattern-circular-quality-gates). The circularity problem from section 2, in general form.

**Video**
- Aakash Gupta's podcast: [How to Do AI Evals Step-by-Step with Real Production Data](https://www.aakashg.com/hamel-shreya-ai-evals-step-by-step/) (Hamel and Shreya, also on YouTube). Watch them build the "what good looks like" list from real data.
- Maven free lesson: [The cold-start eval problem](https://maven.com/p/5fb214/the-cold-start-eval-problem-evals-for-new-ai-products). How to build a first answer key when you have no production data yet.
