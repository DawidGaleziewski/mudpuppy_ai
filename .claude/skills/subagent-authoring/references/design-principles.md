# Design principles

Contents: 1 Agent or something else · 2 One job · 3 Descriptions · 4 Progressive disclosure ·
5 Tools, model, effort · 6 Memory, hooks, isolation · 7 Anti-patterns

## 1. Agent or something else?

Each mechanism has a different cost profile. Choose the cheapest that solves the problem.

| Need | Use | Why |
| --- | --- | --- |
| Facts/conventions Claude should know in every session | CLAUDE.md (or `.claude/rules/`) | Always loaded; keep short |
| Reference knowledge or a procedure needed sometimes | Skill | Only the ~100-word description is always loaded; body loads on use |
| A repeatable workflow you trigger by name | Skill with `disable-model-invocation`, or slash command | Explicit invocation |
| A rule that must hold every time | Hook, `disallowedTools`, permissions, or a test | Deterministic; prose can be skipped |
| A task whose intermediate work is noisy (reads dozens of files, long logs) | **Subagent** | Isolated window; only a summary returns |
| Independent tasks that can run in parallel | **Subagent(s)** | Parallelism |
| Restricted tools, or a cheaper/stronger model for one task type | **Subagent** | Per-agent `tools`/`model` |
| Knowledge that should accumulate across sessions for one role | **Subagent + `memory`** | Per-agent memory dir |
| A skill's task that should run isolated | Skill with `context: fork` + `agent:` | Skill supplies the task, agent supplies the environment |

Smells that it should not be an agent: the body is mostly reference material (→ skill); the task needs
back-and-forth with the user (a subagent can't converse); the work is a few tool calls whose output the
parent needs in full (isolation adds cost, no benefit); it duplicates a hook or permission.

## 2. One job

- Write the job as "<verb> <object>, return <shape>". Two independent verbs = two agents.
- Split by *task type and tool needs*, not by topic area. "Database stuff" is a topic; "write and review
  migrations" (Read/Write/Edit/Bash) and "advise on storage engine choice" (read-only, no edits) are jobs.
- Advisory jobs that only produce a recommendation rarely need an agent at all — a skill loaded by the
  main agent is cheaper. Reserve agents for work whose *process* should stay out of the main context.
- Read-only reviewers get no Write/Edit. Implementers get no web tools unless the job needs them.
- Avoid a "manager" agent that routes to other agents; the parent already does that.

## 3. Descriptions

The description is the only part of an agent always in the parent's context, and Claude uses it to
decide delegation. All agent descriptions together share a 15,000-token budget (a startup warning fires
beyond it). Therefore:

- Formula: **what it does + when to use it + what it does NOT do.** Target ≤50 words.
- Lead with the trigger condition in the words a user or the parent would actually use.
- Add "Use proactively when …" only if you want automatic delegation; leave it off for agents you only
  want when explicitly asked.
- Put examples, rationale and rules in the body (loaded only when the agent runs), never in the
  description.
- Make neighbours distinguishable: if two agents' descriptions could both match a task, add the
  boundary to each ("schema and migrations; not query tuning advice").
- Test it: write 3 phrasings of a task that should route here and 2 near-misses that shouldn't; check
  the description alone would separate them.

## 4. Progressive disclosure for agents

Three tiers, mirroring skills:

1. **Frontmatter description** — always loaded (router).
2. **Body** — loaded on every run. Only what is needed for *every* invocation: role, procedure, hard
   rules with reasons, output contract, and a "read X when Y" index.
3. **On-demand references** — loaded only when the condition in tier 2 fires.

Where tier 3 lives:

- **A skill** (`.claude/skills/<name>/SKILL.md` + `references/`). Discoverable via its description;
  the agent invokes it with the Skill tool. Requires `Skill` in `tools` if `tools` is restricted.
  Best when several agents or the main session share the knowledge.
- **A plain file the body names** (e.g. `data/schema/README.md`, a spec file). The agent uses Read.
  Best when the material is project artifacts that already exist — don't copy them into the prompt.
- Do **not** put reference `.md` files in `.claude/agents/`; every `.md` there may be parsed as an agent.

Rules of thumb:
- If a paragraph is only relevant to some invocations, it is tier 3.
- Point, don't paste: "Migration conventions: invoke skill `sqlite-conventions`" beats 40 lines of
  conventions. The pointer must carry its trigger ("before writing a migration").
- Non-fork subagents already load CLAUDE.md and its imports. Anything there is tier 0; don't repeat it.
- `skills:` frontmatter injects full skill content at startup — that collapses tier 3 into tier 2.
  Use it only for small, always-needed skills.
- `omitClaudeMd: true` (v2.1.271+) strips CLAUDE.md from a narrow agent that doesn't need it.

Size targets for the body: ≤250 words typical, 400 hard cap. If you are past ~400, classify each
paragraph as keep / move / delete before adding anything.

## 5. Tools, model, effort

- **Tools**: list the minimum. Omitting `tools` inherits everything available, including every MCP
  tool — convenient but broad. Prefer an explicit allowlist, or `disallowedTools` to subtract from
  the inherited set. Include `Skill` when the agent should load skills. Omit `Agent` unless the agent
  genuinely delegates (nesting is depth-limited and rarely worth it).
- **Model**: `haiku` for search/extraction/read-only scans; `sonnet` for implementation and most
  reviews; `opus` (or higher) for hard design or subtle review; `inherit` when the parent's choice
  should govern. Resolution order: per-call parameter → frontmatter → `CLAUDE_CODE_SUBAGENT_MODEL` →
  parent model.
- **Effort**: `effort` in frontmatter overrides the session level; lower it for mechanical agents.
- **maxTurns**: a backstop for agents that can loop (test-fix cycles); the result is marked partial and
  is resumable.

## 6. Memory, hooks, isolation

- `memory: project` (recommended scope) gives the agent `.claude/agent-memory/<name>/`; its first
  200 lines / 25KB of `MEMORY.md` are injected, and Read/Write/Edit are auto-enabled. Use it for agents
  that learn repo conventions over time; add one line to the body telling it what to record. Not for
  facts already derivable from the repo.
- **Hooks** in frontmatter (PreToolUse / PostToolUse) run only while the agent is active — the right
  place for "validate every Bash command" or "run the linter after edits".
- `isolation: worktree` for agents that make risky, wide edits; `background: true` for fire-and-forget
  work.
- `permissionMode`: be conservative; `bypassPermissions` on a project-shared agent is a review flag.

## 7. Anti-patterns

- **Mega-agent**: many jobs, 1,000+ words, everything "just in case".
- **Constitution copy**: restating project principles already in CLAUDE.md / constitution.
- **Persona filler**: "You are a world-class expert…" adds nothing; state the job and constraints.
- **Description as manual**: examples and rules in frontmatter.
- **Prose enforcement** of what a hook/permission/test could guarantee.
- **Interactive assumptions**: "ask the user before proceeding" in an agent that can't converse.
- **No return contract**: the parent gets a rambling transcript instead of a usable summary.
- **Unrestricted tools by omission** on an agent that only needs Read/Grep.
- **Dead pointers**: references to files, skills or sections that no longer exist.
- **Preloading big skills** via `skills:` "so it has everything".
- **Overlapping siblings** with no stated boundary, causing flaky delegation.
