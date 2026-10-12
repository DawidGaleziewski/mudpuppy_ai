# Quickstart: validating spec 019

## Fast checks (every commit)

```bash
cd apps/crawler && pnpm typecheck && pnpm lint && pnpm test:fast
cd apps/dashboard && uv run ruff check && uv run pytest -n auto -m 'not perf' && uv run pytest -m perf
cd apps/proving-ground/backend && uv run pytest
```

## Gates (slow tier; ports 4200/4201 free)

```bash
cd apps/crawler && pnpm test:slow
```

Expect green: LO-21 (HTTP hops recorded), LO-22 (meta refresh + script hops), LO-23 (old and new
policy URL → one state, interstitial not a state), LO-24 (no session id in a route template, the
visit URL keeps it), LO-52 (every parameter of `wyciag.do` in the inventory), LO-53 (late frame
mount observed).

## By hand on the proving ground

1. Start the proving ground and the dashboard; map the bank as `client` through the chat or an
   eval run.
2. Dashboard → state of `wyciag.do` → "Reached under": URLs with `;jsessionid=…`, `konto`, `typ`,
   `okres`, `tryb`; inventory lists each parameter with its values.
3. Insurer: navigate `/polisa.php?id=7` → the state page of the policy screen lists the entry URL
   with hops `start → meta_refresh → script`.

## Evals (one at a time, owner's quota)

```bash
cd apps/crawler && pnpm eval --task proving-ground-bank   # then shop, insurer, reference
```

Read `ba_write_refusals.rate` (SC-005: < 0.10) and `crawl_screens` (SC-006) in the trial's scores.

## Dashboard eval stores

Open http://127.0.0.1:8765 → store picker → `eval · proving-ground-bank · <time>` → the bank's runs
and docs show. A portal with no data in the main store names the eval stores that have it.
