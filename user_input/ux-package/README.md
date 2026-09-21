# UX Dashboard Designer — portable package

An agent + skill pair for implementing new IT/internal dashboards and revamping old ones. Both pieces follow progressive disclosure on purpose, so nothing gets loaded until it's actually needed:

```
agents/
  ux-dashboard-designer.md      <- the subagent: ~30 lines, persona + priorities, points at the skill
skills/
  revamp-dashboard/
    SKILL.md                    <- the methodology: ~50 lines, points at references/ for depth
    references/
      console-design-system.md  <- a complete, ready-to-use dashboard design system (the bundled default)
      audit-and-migration-playbook.md
      tokens-to-code.md
      good-practices-scorecard.md
```

**Why it's split this way:** the agent file stays short because it doesn't repeat the skill's content — it just knows the skill exists and when to reach for it. The skill's own SKILL.md stays short the same way, pointing into `references/` for anything long enough to not need loading on every single task (the full bundled design system, the redesign playbook, the scorecard). Three tiers, loaded only as needed: agent metadata → agent body → skill → skill references.

## Installing in Claude Code

1. Copy `agents/ux-dashboard-designer.md` into `.claude/agents/` in your project (or `~/.claude/agents/` for a user-wide agent).
2. Copy `skills/revamp-dashboard/` into `.claude/skills/` in your project (or `~/.claude/skills/`).
3. Claude Code will route to the subagent automatically when a dashboard task comes up, and the subagent will read the skill on its own.

## Installing in Claude.ai / Claude Cowork

- The **skill** can be uploaded directly as a Capability/skill if your workspace supports custom skills — upload the whole `skills/revamp-dashboard/` folder (or zip it separately; a `.skill` file is just this folder zipped).
- The **agent** file isn't a native claude.ai concept, but its content works as a **Project system prompt** or **custom instructions** — paste the body of `ux-dashboard-designer.md` (everything after the frontmatter) into a Project's instructions, and it'll behave the same way once the skill is also available to that Project.

## Using it in another harness entirely

Neither file is Anthropic-proprietary format underneath the frontmatter — `agents/ux-dashboard-designer.md` is a system prompt with a header, and `skills/revamp-dashboard/SKILL.md` plus its `references/` are just markdown. To use them anywhere that takes a system prompt and optionally some retrievable documents:

- **If your harness supports retrieval/on-demand file loading** (RAG, tool-based file reads, anything where the model can `read_file("references/console-design-system.md")` mid-task): keep the structure as-is. That's what it was built for.
- **If it doesn't** — a single flat system prompt is all you can supply — concatenate `SKILL.md` and every file under `references/` into one document and append it to the agent's system prompt, in the order they're referenced. The "Portability note" at the bottom of `ux-dashboard-designer.md` says the same thing in-context, so the agent knows to expect it.
- Either way, `references/console-design-system.md` is the one file worth keeping intact no matter what — it's the actual design system (colors, type, spacing, motion budget, component rules) written to be usable standalone, without needing to fetch anything else.

## What this does *not* include

This package doesn't require or assume the specific product ("felix telemetry") the bundled Console design system was originally built for — `console-design-system.md` was written to stand on its own, with felix mentioned only as one worked example of a product built on it. If you'd rather this default to a different look entirely (a different identity color, a light theme, a completely different aesthetic), replace `console-design-system.md` with your own equivalent write-up; everything else in the skill (the audit playbook, the tokens-to-code patterns, the scorecard) stays useful regardless of which design system it's pointed at.
