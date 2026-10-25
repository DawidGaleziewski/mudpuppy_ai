# ADR-0007: The dashboard reads the store read-only; writes go through TypeScript

- **Status:** Accepted (write path widened by [ADR-0019](0019-console-writes-go-through-the-chat-service-as-revisions.md))
- **Date:** 2026-09-25 (spec 003; constitution 1.3.0), review writes 2026-10-03 (constitution 1.4.0)

## Context

The operator dashboard (R-12) is Python (FastAPI, uv), while every write must be validated by the
Zod schemas in TypeScript. People need to see a crawl live while the crawler writes, and later to
confirm or reject the BA's records.

## Decision

- The dashboard opens SQLite as `file:<path>?mode=ro` with `PRAGMA query_only = ON` and a busy
  timeout: one short-lived connection per request, one long-lived connection for live updates.
  If the store is missing it shows an error instead of creating an empty DB.
- Its Pydantic read models mirror the tables; a test builds a store from the migrations and fails
  when the models drift from the columns.
- Live updates poll `PRAGMA data_version` (changes exactly when another connection commits).
- Constitution 1.4.0 (spec 004): the dashboard MAY record review decisions only by invoking the
  TypeScript command `docs:review` (subprocess, JSON on stdin), which validates with Zod, checks
  the revision is current and writes in one transaction. The dashboard process itself stays
  read-only.

## Consequences

- Good: Python cannot write the store even through a bug (`mode=ro`, then `query_only`).
- Good: Zod stays the single validator of every write; status promotion stays in deterministic
  TypeScript code (Principle IV).
- Bad: a write costs a process start (1–2 s, accepted for a rare human action).
- Later: the chat service became the general write path (ADR-0019); the read-only rule is
  unchanged (`apps/dashboard/CLAUDE.md`: "Reads DB read-only (test_readonly)").

## Alternatives considered

- `immutable=1`: rejected, it would miss live changes and can read torn data while the crawler
  writes.
- Filesystem watch on the `-wal` file: rejected (unreliable inotify on WSL `/mnt` drives).
- Python writes with Pydantic models mirroring Zod: rejected, two validators that can drift.
- A long-lived local TypeScript HTTP service for reviews: rejected at the time as a second server
  for one rare action (it arrived later as the chat service, ADR-0012).
- Review files ingested later by a TypeScript job: rejected, the UI could not show the result.

## Sources

- `specs/003-dashboard-ui/research.md` §2–§4 (created 2026-09-25)
- `specs/004-ba-documentation/research.md` §1–§2
- `.specify/memory/constitution.md` Technical Constraints ▸ Python tooling; 1.3.0 and 1.4.0 Sync
  Impact Reports (git `1ce2d207`, `5d92d3c5`)
- `apps/dashboard/CLAUDE.md` (Invariants)
