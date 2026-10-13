# Quickstart: validating spec 021

From `apps/crawler`:

1. `pnpm typecheck && pnpm lint && pnpm test:fast` — config, safety, preflight and trace-config unit
   tests assert the new defaults (omitted limit → no ceiling; production without `rate_limit`
   loads; placeholder User-Agent accepted; boot mode `all`).
2. Stop anything on ports 4200/4201, then `pnpm test:slow` — the trace-boundary gate on
   `reference-insurer-readonly` still stops at "Dalej" (explicit `read`); the CAPTCHA e2e hands
   off on a production-labelled portal and the run continues; a Playwright trace chunk is written
   for a production-labelled run.
3. `grep -rn "environment === 'production'\|environment !== 'production'" apps/*/src apps/crawler/packages/*/src`
   — no hits (SC-001).

From `apps/dashboard`: `uv run ruff check && uv run pytest -n auto -m 'not perf' && uv run pytest -m perf`.

From `apps/chat` and `packages/workflow`: `pnpm typecheck && pnpm lint && pnpm test`.
