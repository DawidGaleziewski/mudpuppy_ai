# 7. Context engineering and tool design

## What context engineering is

Everything a model knows in a given step is in its **context window**: the system prompt, the agent's
instructions, tool definitions, every earlier message, every tool result. Context engineering is
deciding what goes in there, in what form, and what stays out.

It matters because of **context rot**: models get worse as the context grows, well before it's "full".
Chroma's research measured accuracy dropping as input grows, across 18 models, with irrelevant-but-similar
text ("distractors") hurting most. Anthropic's guidance treats context as a limited budget: the smallest
set of high-signal tokens that gets the job done.

## Where you're already good

- **The crawler's tool surface**: 9 tools, no shell or browser, the server decides safety and selectors.
  That keeps both the tool list and the agent's options small. A strong design.
- **R-24**: slimmer `act`/`navigate` results for known states, inferred edges, `next` item in results. Cache
  reads went from 38–78M to ~1M tokens for the same 21 states. That's context engineering, done after
  measuring.

The gap: this was found late (R-24 after R-30). The habit to build is measuring from the first prototype.

## The concepts

### Tool results are context

Every tool result lands in the context and stays there for the rest of the session. A 3,000-token page
dump returned 50 times is 150k tokens of mostly stale information. Design results to be **small, relevant
to the next decision, and stable** (no noise that changes every call).

### Tool design for agents (not for developers)

From Anthropic's [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents):

- Few, well-chosen tools beat many thin wrappers over endpoints.
- Return meaningful, high-signal information; drop ids and fields the agent doesn't use.
- Error messages are instructions: say what to do next (your `ACTION_REFUSED is final` and
  `FRONTIER_NOT_EMPTY` already do this).
- Evaluate tools with real tasks, and let Claude read transcripts to suggest tool improvements.

### Instructions are context too

`CLAUDE.md`, memory files, skill descriptions, agent prompts: all loaded every session. Each rule competes
with the others. A long list of "never X" rules gets followed less reliably than a short one. Current sizes
in this repo: `CLAUDE.md` ~4.4 KB, `MEMORY.md` index ~2.3 KB plus 17 memory files, `roadmap.md` **72 KB
(~18k tokens)**, which the `po` agent reviews and edits on every item start and close (most of it is
history notes on done items). A spec folder (e.g. spec 015) is ~1,000 lines before
contracts and checklists.

### Sub-agents as context isolation

A sub-agent starts with a clean context and returns a short summary. Your crawler/BA split already does
this. The same idea helps in development: big searches or reviews in a sub-agent keep the main session
small. The cost: the sub-agent re-reads what it needs, so it's not free.

### Compaction and notes

Long tasks run out of context. The options: summarise (compaction), keep structured notes outside the
context (your `session_dump/`), or split the task. Anthropic's context-engineering post covers all three.

## Exercises

- **7.1 What fills a crawler session?** Take one eval crawler transcript
  (`~/.claude/projects/-home-dawid-projects-pathfinder-ai/<crawler_cli_session>.jsonl`). Ask Claude for a
  script that lists each tool call with the size of its result (characters / 4 ≈ tokens). Sort. Which three
  result types take the most space? Is each part of them used by the agent's next step?
- **7.2 Your own session start.** Start a fresh Claude Code session in this repo and run `/context`. Write
  down how many tokens are used before you type anything, and by what. Decide what you'd cut (section 8).
- **7.3 Tool-result review.** Read one `navigate` result from a transcript as if you were the agent. Mark
  every line you'd need for the next decision. What fraction is it?

## Where in your process

- **New agent or new tool**: the first prototype run records tokens per step, before any spec of further
  features.
- **Eval results**: you already store `cost.usd` and tokens; add tokens per crawler step to see the trend.
- **Instructions**: review `CLAUDE.md`, memory and skill sizes once per roadmap review (R-41).

## Resources

**Articles**
- Anthropic: [Effective context engineering for AI agents](https://anthropic.com/engineering/effective-context-engineering-for-ai-agents). **Core reading.**
- Anthropic: [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents). Directly about MCP tool design, i.e. your crawler and BA servers.
- Anthropic: [Building effective agents](https://www.anthropic.com/research/building-effective-agents). Workflows vs agents and the five patterns.
- Anthropic: [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system). Orchestrator and sub-agents, token cost, and how they evaluated it.
- Anthropic: [Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices). CLAUDE.md, context management and workflows for your development setup.
- Chroma: *Context Rot: How Increasing Input Tokens Impacts LLM Performance* (Hong, Troynikov, Huber, 2025), summarised by [PromptHub](https://www.prompthub.us/blog/why-long-context-windows-still-dont-work).

**Video**
- *Prompting for Agents*, Code w/ Claude 2025 (Anthropic, ~30 min, on Anthropic's YouTube channel). How Anthropic writes agent prompts and tool descriptions.
- Barry Zhang, [How We Build Effective Agents](https://www.youtube.com/watch?v=D7_ipDqhtwk) (15 min).
- Karpathy, [Software Is Changing (Again)](https://www.youtube.com/watch?v=LCEmiRjPEtQ). The "LLM psychology" part (anterograde amnesia, jagged intelligence) is why context engineering exists.
- The Pragmatic Engineer: [Building Claude Code with Boris Cherny](https://newsletter.pragmaticengineer.com/p/building-claude-code-with-boris-cherny) (podcast with video). How the Claude Code team thinks about the harness.
