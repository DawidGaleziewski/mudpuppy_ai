# 9. From prototype to product

Smaller than the other sections, but worth knowing before R-33 and before anyone else uses MudPuppy.

## Login vs API key

Today the agents run through **your personal Claude Code login**: evals spawn `claude -p`, and the chat
service (`apps/chat`) uses `@agentclientprotocol/claude-agent-acp` on top of Claude Code. That's a good
choice for a prototype you run yourself: no API bill, Claude Code's harness for free.

It stops working when:

- **Someone else runs it.** Each user would need their own Claude Code login and setup.
- **You sell or host it.** A product used by other people should run on the **Claude API / Agent SDK with
  its own API key** and billing. Check Anthropic's current terms for what a subscription login may be used
  for, rather than assuming.
- **Evals and development share a quota.** Already hit: spec 014 F-04 (baselines promoted from BA sessions
  cut off by the usage limit) and R-40.

The Agent SDK is the same agent loop Claude Code uses, as a library. Moving to it later is mostly
plumbing, *if* your harness keeps the "how do I call Claude" part behind one small interface. Worth
checking now that it is.

## Cost per portal

Measured: $1.30–6.30 per eval run (one crawl + one BA session) on toy portals with 2–21 screens. A real
legacy portal has hundreds of screens, and R-33 imagines ~100 personas.

Before building R-33, estimate it:

```
cost ≈ personas × (crawl cost per screen × screens + BA cost) × runs
```

Even with sampling (one persona per attribute combination), this can reach hundreds of dollars per full
scan. That changes the design: incremental re-scans, crawling only what differs between personas, cheaper
models for mechanical steps (you already split by model for development; the same idea applies at runtime).

## Exercises

- **9.1 Estimate R-33.** From `data/evals/*/*.json` (`cost.usd`, `checks.crawler_steps`), compute cost per
  crawler step and per screen. Estimate a 300-screen portal × 10 sampled personas × 1 run. Put the number in
  the R-33 discussion.
- **9.2 Find the seam.** Locate every place that starts a Claude session (`apps/crawler/evals/harness/agent.ts`, `apps/chat`).
  Could they switch to the Agent SDK + API key through one function? If not, note what's in the way.

## Where in your process

- Every spec that runs agents gets a "cost per run" estimate and, after building, the measured number.

## Resources

- Anthropic: [Building effective agents](https://www.anthropic.com/research/building-effective-agents). "Agentic systems often trade latency and cost for better task performance."
- Anthropic: [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system). Real numbers on how multi-agent setups multiply token use.
- Barry Zhang, [How We Build Effective Agents](https://www.youtube.com/watch?v=D7_ipDqhtwk). His checklist includes "does the value justify the token cost?".
- Claude Code / Agent SDK docs: ask the `claude-code-guide` agent in this repo for the current setup steps (they change often).
