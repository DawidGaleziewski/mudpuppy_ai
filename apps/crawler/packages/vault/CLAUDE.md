# @mudpuppy/vault

Encrypted test-user credentials per portal and environment, resolved from persona `ref:` names. CLI behind `pnpm vault` (apps/crawler/scripts/vault.ts). Re-exports run-scoped secret redactor from core.

Layer: features (G-07; `apps/crawler/layers.json`). Depends on config, core, store.

## Public API
- Credential resolution; used by crawler, mcp-server, gates, apps/chat.
- Secret redactor: re-exported from core (it lives there so the write choke points need no vault dependency).
- CLI (`pnpm vault`): manage encrypted credentials.
- `import-personas.ts` (`pnpm vault import` = `pnpm personas:import`, spec 024 US1.2): a CSV of
  test users becomes persona files (refs + attributes) and vault rows; `csv.ts` parses RFC 4180.
  The only code here that writes persona files.

## Invariants
- Secrets never reach logs, DB or evidence (redactor at write choke points).
- Tests use obviously fake values (`test-key-not-real`, G-28).

## Where to add things
- New credential type: CLI and resolve logic in `src/`.
- Tests: use fake values (G-28).

## Tests
- `pnpm exec vitest run --project vault`; tier: fast. 4 files.

## See also
- specs/009-legacy-proving-ground (R-26)
- docs/code-guidelines.md (G-28)
