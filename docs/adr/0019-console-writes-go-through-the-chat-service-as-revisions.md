# ADR-0019: Every console write goes through the chat service, as an append-only revision

- **Status:** Accepted
- **Date:** 2026-10-13 (spec 022, R-43 + R-44)

## Context

[ADR-0007](0007-read-only-dashboard-writes-through-typescript.md) allowed the Python dashboard to
write only by invoking `docs:review`. The chat service ([ADR-0012](0012-chat-service-orchestrates-claude-code-agents-over-acp.md))
already wrote amendments for it; spec 010 R10 read that as covered by the `docs:review` precedent
(Python never writes, every write is Zod-validated in TypeScript, the dashboard opens the store
`mode=ro`), confirmed by tests. The redesign (R-43) added many new writes (processes, to-be
variants, proposals), and R-44 asked that nothing be overwritten.

## Decision

- The dashboard keeps reading the store read-only; **every new write goes through the chat
  service** (spec 022 FR-011). After R-100 the dashboard is a JSON API with a relay to the chat
  service (`chat_client.py`, `web/chat_writes.py`, `web/chat_relay.py`).
- **Nothing is overwritten**: screens get observed revisions (r1, r2 …); amendments, processes,
  variants, change specs and the live marker are append-only revisions signed with the reviewer
  name (`MUDPUPPY_REVIEWER`, no accounts). A save on an old base revision is refused (HTTP 409)
  and shown as "Someone saved first" with Rebase. Undo is a new revision that restores the one
  before.
- The React console asks before every write. In the Workbench every write is a command card a
  person confirms (spec 043).

## Consequences

- Good: one validated write path; the dashboard's read-only guarantee holds; history is kept and
  can be restored.
- Bad: the chat service must be running for any write from the console.
- Bad: the constitution's Python bullet still names only `docs:review` as the dashboard's write
  path; the broader reading lives in spec 010 R10, not in the constitution.

## Alternatives considered

- Python writes with Pydantic models: rejected in spec 004 research §1 (drift, weaker guarantee).
- A Python ACP client in the dashboard: rejected in spec 010 R3 (write path in Python).
- For R-44, deleting on change or silently keeping amendments valid: rejected in spec 010 R8b
  (loses BA work / misleading).

## Sources

- `specs/022-salvage-redesign/spec.md` FR-011, `plan.md` (Constraints), `data-model.md`
  ("Every write goes through the chat service (FR-011); a stale `base_rev` answers 409")
- `specs/010-acp-chat-orchestrator/research.md` R3, R8b, R10
- `apps/dashboard/CLAUDE.md` (Layout, Invariants); `apps/web/CLAUDE.md`
- `specs/043-r92-workbench-genui/spec.md`; `CHANGELOG.md` R-43 + R-44 entry, R-102 entry (Undo)
