# Templates

## Lean body skeleton (target ≤250 words)

```markdown
---
name: <verb-noun>
description: <What it does>. Use when <trigger in user's words>. Not for <neighbouring job>.
tools: Read, Grep, Glob, Edit, Skill        # minimum needed; Skill only if loading skills
model: sonnet
---

<One sentence: the job and what it returns.>

## Before you start
- Read `<path>` (section <X>) — <why it matters for this job>.
- Follow CLAUDE.md; only the points below are specific to you.

## Procedure
1. <step>
2. <step>
3. <step> — when <condition>, invoke skill `<name>` (or read `<path>`).

## Rules (with reasons)
- <rule> — because <consequence if broken>.
- <rule> — enforced by <hook/test>; do not work around it.

## Return
Final message, ≤<N> lines: <what changed>, <files touched>, <open questions/assumptions>.
Do not wait for clarification; list unknowns instead.
```

## Description: before / after

Before (≈130 words, examples inside):
> Use this agent for anything touching persisted data — designing or changing the SQLite schema,
> writing and reviewing migrations, defining Zod schemas, evidence storage layout … Invoke it
> proactively whenever … Examples: "add a `processes` table", "the frontier table needs an index" …

After (≈40 words):
> Changes Pathfinder's SQLite schema: tables, columns, indexes, reversible migrations, and the matching
> `data/schema/` snapshot and `data-model.md`. Use proactively whenever a task adds or alters
> persisted structure. Not for storage-engine advice or query-tuning discussion.

## Layout with on-demand references

```
.claude/
├── agents/
│   └── schema-migrator.md            # ~250 words, points to the skill below
└── skills/
    └── sqlite-conventions/
        ├── SKILL.md                  # when to use + index
        └── references/
            ├── pragmas-and-types.md  # read when writing migration setup
            └── index-guidelines.md   # read when adding an index
```

Agent body line: "Before writing a migration, invoke skill `sqlite-conventions`; read only the reference
file it points to for your change." Agent `tools` must include `Skill` (and `Read`).

## Mechanical rule → hook instead of prose

Prose: "Never commit `data/db/*.sqlite*`."
Instead: `.gitignore` entry + a PreToolUse hook (or CI check) that fails on staged matches; the body
keeps one line: "DB files are generated; a hook blocks committing them."
