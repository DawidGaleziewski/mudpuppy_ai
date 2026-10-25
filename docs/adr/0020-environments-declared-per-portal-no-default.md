# ADR-0020: Environments are declared per portal, with no default

- **Status:** Accepted
- **Date:** 2026-10-15 (owner decision D-1, R-61; built in spec 030)

## Context

In the field the MCP servers ran on environment A while the dashboard and chat served B, stray MCP
servers from another checkout answered calls, and a mistyped environment name created a stray
store and split the crawl data. The MCP servers silently defaulted to `production`, and the
environment was a fixed enum (`production`, `staging`, `sandbox`) repeated across packages.

## Decision

- Environments are **free names declared per portal in YAML** (e.g. `dev`, `acceptance`,
  `live`), added by a developer through the console or the chat, never invented by an agent.
- Each environment has its own users (personas, vault entries) and **its own database**; every
  scan, document and amendment belongs to exactly one environment.
- A guard built from the YAML: before an MCP server, the dashboard or the chat opens a store, any
  undeclared name is refused and no store is created for it. Eval workspaces are the only
  exception, admitted by prefix.
- **No default**: `MUDPUPPY_ENV` is required; a server without it refuses to start and names the
  declared environments. The harness (chat service, eval runner) passes the environment
  explicitly; the chat asks when more than one portal or environment fits.
- Every MCP result carries the environment; the console header names it and warns about live
  servers on another environment or checkout.
- No name has special meaning: "production" is just a name, under the same rules as any other
  ([ADR-0018](0018-no-production-guard-environment-is-a-label.md)).

## Consequences

- Good: data of two environments never mixes, and a mismatch shows up at start instead of in the
  data.
- Good: `.mcp.json` and the chat state their environment (`local-dev` for the owner's local test
  store, `sandbox` for the originals, the gates and the tests).
- Bad: one more required setting before anything runs. Some `sandbox` fallbacks (vault CLI, a chat
  credentials endpoint) remained after spec 030 (findings F-11; roadmap R-61 "Left").

## Alternatives considered

The previous design (a fixed enum with a silent `production` default) is the rejected one; no
other alternatives are recorded.

## Sources

- `roadmap.md` R-61 (owner decision D-1, 2026-10-15)
- `specs/030-battle-tested-scars/spec.md` FR-050–FR-052; `findings.md` F-11
- `CLAUDE.md` (Running the apps: "`MUDPUPPY_ENV` (required, no default …, spec 030 R-61)")
- `.mcp.json`
