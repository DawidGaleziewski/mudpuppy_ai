# 6. Outcome first

## The problem in this project

MudPuppy's goal, from the README: *documentation good enough to re-create the portal.* Your own notes add
that migration happens **process by process**. So the most important number is roughly "how much of each
process, with its rules and data, ends up correctly documented".

What happened instead (2026-09-20 → 2026-10-09):

- 44 roadmap items, about 130k lines, a rebrand, a glossary and wiki, wireframes, a chat orchestrator, a
  portal switcher.
- `processes` = 0 % in every eval run, on every portal. Reference `rules` 0–56 %.
- R-39 ("why are processes never matched?") is queued behind R-28, R-37 and R-38.
- And as section 4 found, the eval pipeline couldn't have measured processes anyway (map mode only).

That isn't laziness, it's the normal trap with AI coding: **building is now so cheap that it crowds out
measuring.** Every feature feels like progress. Only the goal metric tells you whether it was.

## The concepts

### North-star metric

One number that best matches the user's goal, which every piece of work is judged against. For MudPuppy,
a good candidate:

> **Process coverage on a hold-out portal**: the share of ground-truth processes whose steps, rules and
> fields are correctly documented, mean of 3 runs.

Supporting metrics (screens, fields, cost per run) still matter, but they serve the north star.

### The thin end-to-end slice

Get *one* path working end to end and scored well before widening. Here: one process on one portal,
crawled → traced → documented → scored ≥ 80 %. Then a second process, then a second portal. Breadth
(more obstacle types, more UI) comes after the slice works, because otherwise you don't know which
breadth matters.

### Count experiments, not features

Hamel Husain's field guide: AI roadmaps should be measured in **experiments run** ("tried X, metric moved
from A to B, n=3"), not in features shipped. A feature that wasn't measured is a guess.

### The rebuild eval: the true end-to-end test

Your product promise is "re-create the portal from the docs". You can test that directly:

1. Take the exported SRS of the reference portal (`docs:export`).
2. Give it, *and nothing else*, to a fresh agent: "Build this portal".
3. Run the same checks against the rebuilt portal as against the original: same screens reachable, same
   form validations (age 17 rejected, postcode format), same process order, same results for the same
   inputs.
4. The score is the share of checks the rebuilt portal passes.

This eval can't be gamed by writing more records: only docs that really describe the portal score well.
It's expensive, so it's a close-out or milestone eval, not a daily one. Start tiny: one process, one
rebuilt page flow.

## Exercises

- **6.1 Rewrite the top 5 roadmap items.** For R-28, R-37, R-38, R-39, R-33 write three lines each:
  *metric it moves*, *expected change*, *how measured (portal, n runs)*. Items where you can't fill in the
  first line: ask whether they should wait.
- **6.2 Design the rebuild eval** on one page: which process, what the builder agent gets, what checks run
  against the rebuilt app, what it costs. Don't build it yet. Compare it with the current categories: what
  does it catch that they miss?
- **6.3 Thin slice plan.** Write the shortest path to "P01 (OC/AC calculator) on the reference portal
  documented and scored ≥ 80 %, n=3": crawler map + trace of P01 in the eval, BA writes the process record,
  grader (code or judge) checks it. List the gaps.

## Where in your process

- **speckit-specify:** add a required "Goal metric" section: which number, current value with spread,
  target.
- **Roadmap:** sort the must-haves by "expected move of the north star per day of work". Keep "to discuss"
  ideas in a separate parking file so they don't compete for attention.
- **Close-out:** the changelog entry states the metric before and after.

## Resources

- Hamel Husain: [A Field Guide to Rapidly Improving AI Products](https://newsletter.eng-leadership.com/p/guide-to-rapidly-improving-ai-products), especially "count experiments, not features".
- Anthropic: [Building effective agents](https://www.anthropic.com/research/building-effective-agents). "Find the simplest solution possible, and only increase complexity when needed."
- Anthropic docs: [Define success criteria](https://platform.claude.com/docs/en/test-and-evaluate/define-success).
- Hamel Husain: ["It's Hard to Eval" Is a Product Smell](https://hamel.dev/blog/posts/eval-smell). If the goal is hard to measure, the product definition is vague.

**Video**
- Barry Zhang (Anthropic), *How We Build Effective Agents*, AI Engineer Summit, 15 min ([talk page](https://ai.engineer/talks/D7_ipDqhtwk-effective-ai-agents), [YouTube](https://www.youtube.com/watch?v=D7_ipDqhtwk)). Short, practical: when an agent is worth it, keep it simple.
- Andrej Karpathy, *Software Is Changing (Again)*, YC AI Startup School, 40 min ([YouTube](https://www.youtube.com/watch?v=LCEmiRjPEtQ)). The "autonomy slider" and "keep the AI on a leash" parts apply directly: generation is cheap, verification is the bottleneck.
