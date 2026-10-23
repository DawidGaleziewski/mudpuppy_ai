# @mudpuppy/config

Loads and validates portal and persona YAML with Zod, resolves extends, computes the effective config.

Layer: models (G-07)

## Public API

Used by: mcp-server, crawler, safety, vault, gates, apps/chat (`src/index.ts` re-exports all).

- `load-portal`, `load-persona`: load and validate the YAML files (`loadPersona` also in the vault CLI).
- `effective`: the effective config after `extends` resolution.
- `portal-schema`, `persona-schema`: the Zod schemas.
- `secrets`, `rule-ids`, `errors`: persona secret refs, portal rule ids, config error types.
- Spec 023: portal `urls` (URL lists; `url-entry.ts` says which entry kind and refuses an
  unusable one), `hooks` (point, fn, match, timeout), `timeouts` (portal and per URL); `scope`
  is strict, so a removed key such as `allowed_paths` fails to load.

- Spec 030: `Environment` (free lowercase names declared per portal, R-61) and `environments.ts`
  (`declaredEnvironments`, `requireEnvironment`: no default, eval names allowed); `FixSpec`
  (`fixes:` of the portal, run by `@mudpuppy/fix-plugins`); `Network` (`proxy`,
  `ignore_https_errors`, R-63); `traces.ts` (`loadTraces`: the `traces.yaml` catalogue).
- Spec 032: `probe-budget.ts` (portal `probes`: `per_step` 24, `per_run` 120 since spec 036); persona
  `test_data` (label → synthetic value for traces, autofill and probes; renamed from `trace_inputs`,
  owner 2026-10-17: a file with the old key is refused with a rename note); `TraceVariant`
  `fault` and `expect` `technical_error` / `branch` (`ProbeFault` comes from core).
- Spec 039 T111: `fingerprint-profiles.ts` (portal `fingerprint: { use, profiles }`, validated by
  resolving every profile; `portalFingerprintProfile(portal, name?)`); depends on
  `@mudpuppy/fingerprint` (kernel) for the built-ins.
- Spec 046: `persona-sample.ts` (`samplePersonas`: one persona per distinct attribute combination
  and the pairs differing in one attribute; pure, used by `scripts/personas-sample.ts`).
- Spec 031: `network.ca_file` (resolved against the portal folder by `loadPortal`) and
  `ca-file.ts` (`readTrustedCa`, `spkiHash`: shared by preflight, the session and the doctor).

## Invariants

- No browser, no LLM; reads files, never writes.
- Selectors and rules come from config, never from code (portal-agnostic).
- Unknown keys are errors (strict Zod).

## Where to add things

- New portal field: `src/portal-schema.ts`, test in `tests/`.
- New persona field: `src/persona-schema.ts`. `attributes` (spec 024: free keys describing what
  decides the test user's access, merged per key by `extends`, never interpreted) is one.

## Tests

- `pnpm exec vitest run --project config`; tier: fast. Fixtures in `tests/`.

## See also

- specs/002-portal-agnostic-safety, specs/009-legacy-proving-ground
- docs/code-guidelines.md (G-07)
