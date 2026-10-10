# @proving-ground/root

Deliberately awkward legacy estate (shop, bank, insurer, legacy pages; Grupa Mokradło, Polish texts) to prove the crawler and BA against known obstacles.

Layer: app (test estate, outside the TS layers)

## Layout
- Django backend (no ORM) in `backend/`.
- Vite/React micro-frontends in `web/`, `web/mfe-*`.
- CMS texts in `cms/`.
- Ground truth in `ground-truth/*.yaml` (YAML, G-34).
- Own pnpm workspace (only exception to single root workspace).

## Run
- `pnpm start` (ports 4100 main, 4101 widget host); gates start it on 4200/4201.
- Rebuild: `pnpm start`.
- Reset: `POST /__admin/reset`.
- Users/passwords: vault (`pnpm vault` in apps/crawler); see README "Users and seeding".

## Invariants
- Data is disposable.
- Obstacles are deliberate — do not "fix" them, they are what the gates test.
- A change here needs `pnpm test:slow` in apps/crawler (gates run here).

## Tests
- `cd backend && uv run ruff check && uv run pytest`.

## See also
- specs/009-legacy-proving-ground
- README.md for full details on users, seeding, reset.
