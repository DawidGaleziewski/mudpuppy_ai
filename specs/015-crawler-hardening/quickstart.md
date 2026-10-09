# Quickstart: validating spec 015 (R-28)

## 1. Gates (deterministic)

```bash
# ports 4200/4201 must be free (the gates start the proving ground)
cd apps/crawler
pnpm test:slow          # e2e + full gate set
```

Expected: LO-10, LO-02, LO-04, LO-11, LO-18, LO-34, LO-43 and F-04@004 run as `gate()` and pass;
the gate report lists no `gap_fixed`; no other gate fails. The new pure tests (clickable dedupe,
field naming, frame splicing, composition schema) run in `pnpm test:fast`.

## 2. Fingerprint stability (SC-006)

```bash
cd apps/crawler
pnpm test -- fingerprint-stability   # stored reference-portal snapshots → same fingerprints
```

## 3. Evals (goal measure), one at a time (spec 014 F-04)

```bash
cd apps/crawler
pnpm eval proving-ground-bank --persona client --session-timeout 20 --budget-usd 8
pnpm eval proving-ground-shop --persona guest --budget-usd 8
pnpm eval proving-ground-insurer --persona client --budget-usd 8
pnpm eval reference-insurer --persona guest --budget-usd 8
```

Expected: bank `crawl_screens` ≥ 8/11 with a `/legacy/bank/*.do` screen; shop ≥ 5/6; insurer
≥ 5/6; reference-insurer no regression; `password_hits` and `widget_actions` 0 everywhere. Each
result and its cause, good or bad, goes to `findings.md`. Promote a new baseline only where it
improved (`--promote`).

## 4. Look at it

Dashboard (`cd apps/dashboard && uv run pathfinder-dashboard`): on the bank run, the
`/bank/historia` state shows the legacy list inside the wrapper; the shop product state lists
"Dodaj do koszyka" as an action found by click signals.
