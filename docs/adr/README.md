# Architecture Decision Records

An Architecture Decision Record (ADR) is a short note about one decision that shaped MudPuppy's
architecture: the situation, what was decided, what it cost and what else was considered. These
ADRs were written on 2026-10-26, after the fact, from the project's own records: the constitution
(`.specify/memory/constitution.md`) and its version history, the specs (`specs/*/spec.md`,
`plan.md`, `research.md`), `roadmap.md`, `CHANGELOG.md`, `docs/code-guidelines.md` and the
`CLAUDE.md` files. Each ADR cites its sources; when an ADR and its sources disagree, the sources
win, and the constitution wins over everything (see [ADR-0001](0001-spec-driven-development-under-a-constitution.md)).

For how the system fits together today, read the [architecture overview](../architecture/README.md).
For the project's vocabulary, see the [glossary](../glossary/README.md).

## Rules for this folder

- One decision per file, `NNNN-kebab-title.md`, numbered in the order the decisions were made.
- **Status** is `Accepted` or `Superseded by NNNN`. A superseded ADR is kept as written; the ADR
  that replaces it says so in a **Supersedes** line, so the link goes both ways.
- **Date** is the date of the decision in the sources (the spec, changelog entry or constitution
  amendment).
- A new decision gets a new ADR. Changing a recorded decision means a new ADR that supersedes the
  old one, not an edit. Decisions that the constitution governs still need a constitution
  amendment (Governance section).

## Template

```markdown
# ADR-NNNN: Title

- **Status:** Accepted | Superseded by [ADR-NNNN](NNNN-title.md)
- **Date:** YYYY-MM-DD (where the date comes from)
- **Supersedes:** [ADR-NNNN](NNNN-title.md) (only when it does)

## Context
The situation and the forces that made a decision necessary.

## Decision
What was decided, stated as rules.

## Consequences
What got better, what got worse, and what followed later.

## Alternatives considered
The options recorded in the sources and why they were not chosen ("None recorded" if none).

## Sources
File paths, spec and roadmap ids, commits.
```

## Index

| # | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](0001-spec-driven-development-under-a-constitution.md) | Spec-driven development under a versioned constitution | Accepted | 2026-09-20 |
| [0002](0002-crawler-is-one-llm-agent-behind-an-mcp-server.md) | The crawler is one LLM agent behind an MCP server that owns the browser and store | Accepted | 2026-09-20 |
| [0003](0003-action-safety-classified-and-enforced-in-code.md) | Action safety is classified and enforced in code, outside the agent | Accepted | 2026-09-20 |
| [0004](0004-production-is-read-only-behind-a-compliance-gate.md) | Production is read-only, behind a compliance gate | Superseded by [0018](0018-no-production-guard-environment-is-a-label.md) | 2026-09-20 |
| [0005](0005-sqlite-store-with-content-addressed-evidence.md) | SQLite store with content-addressed evidence files | Accepted | 2026-09-20 |
| [0006](0006-monorepo-apps-and-packages-pnpm-and-uv.md) | Monorepo with `apps/` and `packages/`; pnpm for TypeScript, uv for Python | Accepted | 2026-09-25 |
| [0007](0007-read-only-dashboard-writes-through-typescript.md) | The dashboard reads the store read-only; writes go through TypeScript | Accepted | 2026-09-25 |
| [0008](0008-server-rendered-htmx-dashboard.md) | A server-rendered htmx dashboard | Superseded by [0023](0023-the-console-is-a-react-single-page-app.md) | 2026-09-25 |
| [0009](0009-ba-agent-without-a-browser-writes-evidence-linked-records.md) | A separate BA agent with no browser writes evidence-linked records | Accepted | 2026-09-26 |
| [0010](0010-evidence-stored-unmasked-pii-scrub-opt-in.md) | Evidence is stored unmasked; PII scrubbing is opt-in per portal | Accepted | 2026-10-04 |
| [0011](0011-forms-filled-with-test-data-only-off-production.md) | Forms are filled with test data and submitted only off production | Superseded by [0018](0018-no-production-guard-environment-is-a-label.md) | 2026-10-04 |
| [0012](0012-chat-service-orchestrates-claude-code-agents-over-acp.md) | A chat service orchestrates Claude Code agents over ACP on the user's login | Accepted | 2026-10-05 |
| [0013](0013-credentials-as-references-and-an-encrypted-vault.md) | Credentials only as `ref:NAME`, values in an encrypted vault | Accepted | 2026-10-05 |
| [0014](0014-gates-on-a-proving-ground-and-separate-evals.md) | Deterministic gates on a local proving ground; paid evals kept apart, in Anthropic's terminology | Accepted | 2026-10-05 |
| [0015](0015-four-package-layers-and-rated-code-guidelines.md) | Four package layers and rated code guidelines | Accepted | 2026-10-07 |
| [0016](0016-test-tiers-and-a-pre-commit-check.md) | Test tiers and a pre-commit check | Accepted | 2026-10-07 |
| [0017](0017-proprietary-licence.md) | A proprietary licence | Superseded by [0026](0026-apache-2-0-licence.md) | 2026-10-12 |
| [0018](0018-no-production-guard-environment-is-a-label.md) | No production guard: the environment is a label | Accepted | 2026-10-13 |
| [0019](0019-console-writes-go-through-the-chat-service-as-revisions.md) | Every console write goes through the chat service, as an append-only revision | Accepted | 2026-10-13 |
| [0020](0020-environments-declared-per-portal-no-default.md) | Environments are declared per portal, with no default | Accepted | 2026-10-15 |
| [0021](0021-mudpuppy-2-reconciled-portal-model.md) | MudPuppy 2.0: scans are reconciled into one portal model | Accepted | 2026-10-18 |
| [0022](0022-decision-mining-in-a-python-worker.md) | Decision mining and community detection in a Python worker (`apps/miner`) | Accepted | 2026-10-18 |
| [0023](0023-the-console-is-a-react-single-page-app.md) | The console is a React single-page app | Accepted | 2026-10-22 |
| [0024](0024-live-workbench-a2ui-and-ag-ui-over-websockets.md) | The live Workbench: A2UI views and AG-UI shared state over WebSockets | Accepted | 2026-10-22 |
| [0025](0025-frontend-architecture-atomic-layers-tokens-rtk-query.md) | Frontend architecture: atomic layers, token-driven styling, RTK Query, checks on commit | Accepted | 2026-10-24 |
| [0026](0026-apache-2-0-licence.md) | Apache-2.0 licence | Accepted | 2026-10-25 |

## Known gaps between the sources

Some older documents still describe decisions that were later reversed. Where they disagree, the
newer decision above holds:

- Older specs (e.g. `specs/001-crawler-map-mode/contracts/config-schema.md`) still describe
  read-only production, the compliance gate and test data only off production
  ([ADR-0004](0004-production-is-read-only-behind-a-compliance-gate.md),
  [ADR-0011](0011-forms-filled-with-test-data-only-off-production.md)); constitution 5.0.0
  removed them ([ADR-0018](0018-no-production-guard-environment-is-a-label.md)). Specs are kept
  as history; the top-level `README.md` follows ADR-0018 since 2026-10-26.
- The constitution's Python bullet names only `docs:review` as the dashboard's write path; in
  practice every write goes through the chat service
  ([ADR-0019](0019-console-writes-go-through-the-chat-service-as-revisions.md)).
- The constitution's Storage line mentions a `jobs` table for the queue; the current schema
  (`data/schema/schema.sql`) has none.
