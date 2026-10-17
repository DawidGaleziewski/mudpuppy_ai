# Quickstart: check spec 033 end to end

Prerequisites: the five test portals mapped (spec 032 live check), the dashboard
(`apps/dashboard`, `uv run pathfinder-dashboard`, port 8765) and the chat service
(`PATHFINDER_ENV=sandbox pnpm --dir apps/chat start`, port 4310) running.

## Map (US1, US2)

1. Choose `reference-insurer` in the header, open Scans ▸ Map (`/map`).
   Expect: the start screen in the top layer, the calculator steps as one deck ("N states"), a
   "+N queued" node where the frontier is not empty, counts in the page head equal to
   `SELECT count(*) FROM screens WHERE portal_id = 'reference-insurer'`.
2. Pick one scan in the filter and Apply: what it did not see is dashed.
3. Tab to a node, press Enter: the inspector shows its states, scans and transitions.
4. On a form-step node press "Mark for probing": back on the map, the node has the Probe tag; the
   screen page shows the same mark (one row in `marks`).
5. `ui:check` at 1280 and 390 on `/map` and `/map?view=list`.
6. Proving-ground shop (60+ screens): the page opens in under 2 s; the 300-screen fixture in the
   perf test under 4 s.

## Differing states (US3, US4)

1. Gates: `scars-differing.test.ts` maps SC-20 twice (a page that answers 503 on its first visit)
   and with two personas; `list_differing_states` returns the temporary group, the persona group and
   no group for SC-19's form steps (SC-005).
2. Live: in a BA session on scar-maker ask the BA to reconcile differing states; it proposes
   verdicts (`reconciliations` rows `proposed`); Review ▸ Differing states lists them.
3. Change one verdict and Confirm: the row is `confirmed` with the reviewer; the BA's next
   `list_differing_states` returns the confirmed verdicts.
4. Eval check `no_error_page_as_step` on the BA's documentation of the scar-maker process (SC-007).

## Tests

- `uv run pytest -n auto -m 'not perf and not serial' && uv run pytest -m 'perf or serial'`
  (dashboard: map layout, routes, inspector, Review kind, confirm forwarding).
- `pnpm typecheck && pnpm lint && pnpm test` in `apps/chat` (confirm route).
- `pnpm test:fast` and `pnpm test:slow` in `apps/crawler` (BA tools, group rules, gates).
