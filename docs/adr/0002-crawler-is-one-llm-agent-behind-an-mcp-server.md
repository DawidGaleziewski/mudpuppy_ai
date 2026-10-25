# ADR-0002: The crawler is one LLM agent behind an MCP server that owns the browser and store

- **Status:** Accepted
- **Date:** 2026-09-20 (spec 001 created; constitution 1.1.0)

## Context

MudPuppy explores unknown portals and records what it finds as evidence. Exploration needs
judgement (where to go next, what a page is for), but the safety checks and the recorded facts
must not depend on that judgement: Principles II, III and V require deterministic checks the agent
cannot override and evidence the agent cannot fabricate.

## Decision

- The crawler is a **single LLM + Playwright agent** with two modes: `map` (capabilities and
  routes) and `trace` (one named process). There is no separate explorer. It records and does not
  interpret: facts, a few flagged hypotheses and open questions.
- It runs as the Claude Code subagent `.claude/agents/crawler.md`. Its `tools:` list holds only the
  `mcp__mudpuppy__*` tools: no shell, file, web or browser tools.
- The `mudpuppy` stdio MCP server (`apps/crawler/packages/mcp-server`, registered in `.mcp.json`)
  owns the only Playwright browser, the database and the evidence store. **The agent proposes; the
  server decides**: the agent picks navigation targets and `action_id`s, the server runs the
  safety classifier, scope and denylist checks, rate limiter and block detector, then executes,
  waits for the page to settle, observes, fingerprints and records.
- Agents reach the database only through MCP tools; they never write SQL, invent ids or choose raw
  selectors.
- The server owns the frontier, so a crawl is not bounded by the subagent's context; a new
  invocation resumes with `start_run { resume_run_id }`.
- Since constitution 6.0.0 (spec 039), replays, probes and boundary tests MAY be run by
  deterministic code (the headless driver) through the same gated tools, without the LLM.

## Consequences

- Good: the deterministic pieces (fingerprinting, safety classification, scope checks, PII
  scrubbing, DB access) are tools the agent calls and cannot bypass; a recorded `observed` fact
  always comes from the server.
- Good: the same server serves the chat service's sessions ([ADR-0012](0012-chat-service-orchestrates-claude-code-agents-over-acp.md)).
- Bad: there is no crawler CLI; a run is started by asking a Claude Code session (or the chat).
- Bad: the tool allowlist is configuration, so a test asserts the agent file's `tools:` list; the
  server remains the real enforcement point. Subagents cannot spawn subagents.
- Bad: the crawler is non-deterministic, so two runs of one portal differ. Its quality is
  measured with evals against ground truth, not with exact-output tests
  ([ADR-0014](0014-gates-on-a-proving-ground-and-separate-evals.md)).

## Alternatives considered

- A Node process driving Playwright and calling an LLM API in a loop: rejected, the user's chosen
  runtime is Claude Code.
- Giving the subagent Bash to run a crawler CLI: rejected, a direct bypass path; command
  allowlists are not enforcement.
- Microsoft's Playwright MCP: rejected, it has no guards.

## Sources

- `specs/001-crawler-map-mode/research.md` §11 (Agent runtime and browser access)
- `specs/001-crawler-map-mode/spec.md` (created 2026-09-20)
- `.specify/memory/constitution.md` Principle III, Technical Constraints ▸ Agent interface;
  1.1.0 amendment (git `ef61ec91`) and 6.0.0 amendment (Sync Impact Report)
- `README.md` (How the crawler works)
- `CLAUDE.md` (Scope & Collaboration: "the crawler/explorer is ONE non-deterministic LLM agent")
