# ADR-0009: A separate BA agent with no browser writes evidence-linked records

- **Status:** Accepted
- **Date:** 2026-09-26 (spec 004 created; role defined in constitution 1.1.0)

## Context

The crawler records facts but must not interpret them (Principle III). Someone has to turn the
evidence into documentation (screens, requirements, business rules, data items, glossary, open
questions) without guessing why the portal behaves as it does (Principles I and II).

## Decision

- A separate `ba` agent (`.claude/agents/ba.md`, skill `ba-practice`, model opus) **never
  browses**. It works only from recorded evidence and asks the crawler for more through follow-up
  tasks (`FUP` records, lifecycle `open → in_progress → done | blocked`).
- Its tools come from a second MCP server, `mudpuppy-ba` (entry point `ba-main.ts` in the same
  package), which has no browser runtime. The crawler server does not register BA tools and vice
  versa; tests assert both lists.
- Layer B storage is generic: `doc_records` (stable key per portal, e.g. `REQ-017`, never reused),
  immutable `doc_revisions`, `doc_evidence_links`, typed `doc_relations`, `doc_reviews`; content
  validated per kind by a Zod discriminated union.
- Every record carries a confidence label (`observed`, `inferred`, `needs_confirmation`) and
  evidence; a record without evidence is not persisted; what cannot be observed is flagged "not
  observable".
- Records enter as `draft`. Status is derived from stored review decisions by a deterministic
  status engine; no write tool accepts a status (Principle VI).
- Pure documentation code lives in `@mudpuppy/docs`: status engine, audit, SRS export
  (`docs:export`) and the goal evaluation against a reference portal's ground truth
  (`docs:evaluate`).

## Consequences

- Good: role separation is enforced by what each server exposes, not only by agent frontmatter.
- Good: the BA's token use is bounded by the evidence size, since it never browses.
- Good: every statement in the exported SRS links back to evidence (`docs:audit` checks it).
- Bad: the BA can document only what the crawler recorded; gaps need a round trip through
  follow-up traces.

## Alternatives considered

- One MCP server with all tools, filtered by each agent's `tools:` list: rejected, a misconfigured
  agent could reach crawler tools.
- A separate TypeScript package for the BA server: rejected, it duplicates bootstrapping.
- One table per record kind, a graph DB, Markdown files as truth: rejected (see
  [ADR-0005](0005-sqlite-store-with-content-addressed-evidence.md)).

## Sources

- `specs/004-ba-documentation/research.md` §3, §4, §5, §7, §8, §11, §14, §16
- `.specify/memory/constitution.md` Principles I, II, III, VI
- `CHANGELOG.md` R-13 (BA store and agent), R-14/R-15 (follow-ups, review), R-16 (SRS export,
  goal evaluation)
- `README.md` (From crawl to documentation)
