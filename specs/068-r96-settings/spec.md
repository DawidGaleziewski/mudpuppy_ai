# Spec 068: Settings in React (R-96, step 19)

**Branch:** `feature/068-r96-settings` · **Owner (2026-10-23):** "Ok proceed I am going out keep on
working at it by yourself as much as you can". The htmx Settings (`web/portals.py`
`settings_page`, `web/hints.py`, `web/check_runs.py` accept; screen 11, spec 011 FR-012, spec 022
FE-T01/T02, spec 039 G11 and owner answers 5 and 14, spec 040 T021, spec 043 T039) move to the
React console, reading and writing through the same chat service calls.

## What this step builds

- **FR-001 The page's data** (`queries_app_settings.py`, `GET /api/portals/{p}/settings`):
  - the environments as the chat service reads them from the portal file, the three known
    ones not configured yet, the action limits in words;
  - whether the chat service runs (and how to start it when not);
  - the stored credentials, names only, never a value;
  - the Workbench's turns today against its cap (when the Workbench is on);
  - the personas with their credential references and attributes as written;
  - the crawl rules, the hints and budgets;
  - screen identity (τ, the pair labels, the classifier, what can be accepted);
  - the data store's path and size;
  - whether a reviewer is set.
- **FR-002 The writes** (`web/api_settings.py`), each through the chat service, each asking
  first, each answering `{ok, message, href}`:
  - save an environment (`PUT /portals/{p}/environments/{e}`: address and limit);
  - revoke one (`DELETE`; the last one stays);
  - save the hints and the budgets (`PUT /portals/{p}/hints`, the htmx form's body, from
    `settings_forms.hints_body`, moved out of the router, G-13);
  - accept the calibrated τ or the classifier (`POST /portals/{p}/model/accept`, signed).
- **FR-003 The page** `/app/portals/:portal/settings`, Settings in the menu under Machine; Changes'
  "Settings ▸ Hints" link opens it.

## Not in this step

- The "+ new portal" form (`/portals/new`): a page of its own, outside a portal's menu.

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (138 tests; `tests/settings.test.tsx`:
      every part with credentials by name, the stopped chat service, an environment saved and one
      revoked, the budgets saved and τ accepted, each asked first); `pnpm build`; `pnpm build-storybook`.
- [x] Dashboard: ruff; `tests/test_api_settings.py` (every part with no credential value, the
      stopped chat service, environments saved, refused and revoked through the chat service,
      hints, budgets and accept); the htmx Settings tests unchanged after the move; the whole suite.
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px on local-dev, without and with the
      chat service (started for the check, then stopped by its PIDs; no orphaned processes): all pass.

## Close-out review: feature/068-r96-settings (2026-10-23)

`queries_app_settings.py` 215 lines, `Settings.tsx` 181, `SettingsModel.tsx` 200; no function over
80 lines or 5 parameters; `api_settings.py` imports no router (`hints_body` now in
`settings_forms.py`, G-13) and has no SQL (G-15); the file maps name the new files (G-30); pages
compose only, the selects only set form state, every write asks first, one primary button.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `apps/web/src/app/api-settings.ts:59` | G-20 | `settingsHref`'s `part` anchor was never used. | Removed | small | fixed |

Summary: 1 finding, 1 fixed. Left as is: the three known environments are listed in both
`api-settings.ts` and `queries_app_settings.py` (the form offers them whatever the file holds).
