# Lint baseline (spec 012 T017, T021, measured 2026-10-07)

Typed lint (`recommendedTypeChecked`, `projectService`) in `apps/crawler`, `apps/chat` and
`packages/workflow`, plus the size and complexity warnings of guidelines G-01..G-04. Errors fail
`pnpm lint`; warnings do not and are counted here. Refresh with
`pnpm lint:report . ../chat ../../packages/workflow` in `apps/crawler`.

## Cost

| | Before | After |
| --- | --- | --- |
| `pnpm lint` wall time in `apps/crawler` | 2.4 s (`recommended`, not type-aware) | 10.4 s (typed) |

## Errors found when typed lint was switched on (all fixed in T018–T020)

| Rule | Hits | What was done |
| --- | --- | --- |
| `no-floating-promises` | 1 | `reference-portal/src/main.ts`: a start failure now prints and exits 1 instead of an unhandled rejection |
| `no-misused-promises` | 8 | `mcp-server` `server.ts` / `ba-server.ts`: async `shutdown` passed to `process.once` → a void listener that exits 1 if shutdown throws (5 + 2); `reference-portal/src/server.ts`: async request handler → wrapped, a failed request answers 500 |
| `no-unnecessary-type-assertion` | 23 (+6 chat) | `eslint --fix`; one removal broke typecheck in `gates/tests/ground-truth.test.ts` (lint and tsc disagree on a DOM test file) → `querySelector<HTMLInputElement>` |
| `unbound-method` | 6 | `core` `Redactor` methods declared `this: void` (they are closures); `autofill.ts` one disable with reason (`.call` on the setter); tests: rule off (`expect(mock.method)`) |
| `no-implied-eval` | 4 | `crawler/src/pw-eval.ts`: deliberate `new Function` (the `__name` shim), disable with reason; tests: rule off |
| `restrict-template-expressions` | 5 | `String(…)` around `unknown` values (tests, one script) |
| `require-await` | 72 | made a warning: async functions implementing an async interface; no bug signal |
| `no-base-to-string` | 15 | made a warning: `String(value ?? '')` on `unknown` JSON (`unknown ?? ''` is typed `{}`) |

## Warnings (baseline, TypeScript)

| Rule | Total | Per package |
| --- | --- | --- |
| `@typescript-eslint/no-base-to-string` | 18 | docs 13, chat 3, core 1, reference-portal 1 |
| `@typescript-eslint/no-unsafe-argument` | 37 | gates 20, mcp-server 12, docs 2, chat 2, wireframe 1 |
| `@typescript-eslint/no-unsafe-assignment` | 99 | mcp-server 72, crawler 10, core 5, chat 4, safety 3, vault 2, docs 1, gates 1, wireframe 1 |
| `@typescript-eslint/no-unsafe-call` | 42 | mcp-server 42 |
| `@typescript-eslint/no-unsafe-member-access` | 199 | mcp-server 168, wireframe 12, gates 9, core 8, vault 2 |
| `@typescript-eslint/no-unsafe-return` | 24 | mcp-server 18, core 2, docs 2, gates 1, vault 1 |
| `@typescript-eslint/require-await` | 72 | mcp-server 20, core 19, gates 17, crawler 15, vault 1 |
| `complexity` (> 15) | 47 | chat 10, crawler 7, docs 7, mcp-server 6, core 4, reference-portal 3, safety 3, workflow 3, fingerprint 1, gates 1, vault 1, wireframe 1 |
| `max-depth` (> 4) | 4 | core 2, docs 1, gates 1 |
| `max-lines` (> 400) | 20 | mcp-server 8, core 5, docs 4, crawler 1, gates 1, wireframe 1 |
| `max-lines-per-function` (> 80, tests exempt) | 38 | mcp-server 10, docs 9, chat 7, crawler 5, core 3, vault 2, wireframe 2 |
| `max-params` (> 5) | 11 | mcp-server 4, core 2, docs 2, crawler 1, wireframe 1, chat 1 |

`no-unsafe-*` hits in `mcp-server` are mostly test bodies typed `Record<string, any>`
(`tests/harness.ts` `Body`); typing the harness responses would remove most of them.

## Warnings (baseline, Python, `apps/dashboard`)

`uv run ruff check --select C901,PLR0912,PLR0913,PLR0915 --exit-zero` with `max-complexity = 15`
and `max-args = 5` (G-03, G-04) in `pyproject.toml`:

| Rule | Total | Where |
| --- | --- | --- |
| `C901` complexity > 15 | 2 | `app.py` `create_app` (221), `glossary.py` `_load` (30) |
| `PLR0912` branches > 12 | 2 | `glossary.py` `_load`, `smoke.py` `run` |
| `PLR0913` arguments > 5 | 18 | (mostly query helpers and test fixtures) |
| `PLR0915` statements > 50 | 2 | `app.py` `create_app` (564), `glossary.py` `_load` |
