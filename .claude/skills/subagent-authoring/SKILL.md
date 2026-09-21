---
name: subagent-authoring
description: Create, review, refactor or slim down Claude Code subagents (`.claude/agents/*.md`). Use whenever the user mentions subagents, agent definitions, agent frontmatter (tools, model, skills, memory, hooks), a bloated or overlapping agent, splitting or merging agents, delegation not triggering, or asks "should this be an agent or a skill?" — even if they never say "skill". Also use before writing any new agent file.
---

# Subagent authoring

A subagent is an isolated worker: fresh context, its own tool set, and only its final message returns
to the parent. Its markdown body is its entire system prompt, paid for in full on every run. So the
craft is deciding *whether* something should be an agent, then making it as small as it can be while
still doing one job well. Bloat is the default failure mode; most of this skill exists to resist it.

Pick a mode, then follow it. Load reference files only when the step says so.

## Mode 1 — Create

1. **Justify the agent.** Read `references/design-principles.md` §1. A subagent earns its place only for
   context isolation (noisy reads), parallelism, tool restriction, a different model, or persistent
   memory. If none applies, recommend a skill, a CLAUDE.md rule, a hook, or a slash command instead and
   say why. Don't create an agent to hold reference knowledge.
2. **Scope to one job.** State it in one sentence: "<verb> <object>, return <shape>". If it needs "and"
   twice, it is two agents. Check existing agents in `.claude/agents/` and `~/.claude/agents/` for
   overlap before adding a new one; extend or split instead.
3. **Design the frontmatter.** Read `references/frontmatter.md`. Least-privilege `tools`, the cheapest
   `model` that does the job, a short routing-oriented `description` (see principles §3).
4. **Write the body lean.** Use the skeleton in `references/templates.md`. Target ≤250 words; hard cap
   400. Everything that is only sometimes needed goes to a skill or reference file that the body
   points to with a *when* condition (progressive disclosure, principles §4).
5. **Push enforcement out of prose.** Rules that can be mechanical (never touch X, always run Y after
   edits) belong in a `hooks` entry, `disallowedTools`, permissions, or a test — not in a paragraph the
   model may skip. Say so in the body only as one line of "why".
6. **Verify.** Run `python3 scripts/lint_agent.py <file> --root <repo>` and fix errors. Then dry-run:
   read the agent as a fresh model with only its body plus a plausible task message. Can it act
   without asking anything? Does it know what to return?

## Mode 2 — Review or refactor

1. Run `python3 scripts/lint_agent.py <file> --root <repo>` — objective metrics (body words,
   description words, unknown fields, duplicated text vs CLAUDE.md/constitution, dead paths).
2. Read `references/review-checklist.md` and score each dimension with evidence (quote the line).
3. For a bloated agent, classify every paragraph: **keep** (role, procedure, hard rules, output
   contract) / **move to skill or reference** (sometimes-needed detail) / **delete** (duplicates a
   file the agent already loads, or generic advice the model knows). Show the classification, not
   just the verdict — it is the refactor plan.
4. Propose the split when one agent has several jobs; each resulting agent gets its own one-sentence
   job and description that says what it does *not* cover.
5. Report in the format at the end of the checklist. Apply changes only if asked; when asked, make the
   edit, re-run the linter, and show before/after word counts.

## Ground rules that apply in both modes

- **The description is a router, not documentation.** It decides delegation and counts against a shared
  15k-token budget across all agents. What + when + boundary, in under ~50 words; no example lists.
- **Do not restate what the subagent already loads.** Non-fork subagents get CLAUDE.md (and its
  imports) automatically. Restating principles from the constitution creates two sources of truth.
  Point to the file instead, and tell the agent *which section* matters for its job.
- **`skills:` preloads full skill text.** Using it for a large skill re-creates the bloat you removed.
  Leave it off and let the agent invoke skills on demand, or preload only tiny always-needed ones.
  On-demand loading needs `Skill` in `tools` when `tools` is restricted.
- **A subagent cannot chat with the user.** Tell it to return open questions and assumptions in its
  final report instead of blocking on clarification.
- **Define the return contract.** The parent sees only the final message. Specify its shape and size
  ("≤15 lines: changes made, files touched, open questions").
- **Explain why, not just what.** A rule with its reason lets the model handle the case you didn't
  foresee; a wall of MUSTs gets pattern-matched and skipped.
- Frontmatter fields and versions change. If anything in `references/frontmatter.md` matters to the
  decision and might be stale, re-check https://code.claude.com/docs/en/sub-agents (or Context7,
  `/websites/code_claude`) before asserting it.

## Files

- `references/design-principles.md` — agent vs skill vs rule vs hook, one-job scoping, description
  writing, progressive disclosure patterns, tools/model/memory choices, anti-patterns.
- `references/frontmatter.md` — every field, defaults, gotchas, version requirements.
- `references/templates.md` — lean body skeleton, description before/after, layout for an agent with
  on-demand references.
- `references/review-checklist.md` — scoring rubric and report format.
- `scripts/lint_agent.py` — deterministic checks (stdlib only).
