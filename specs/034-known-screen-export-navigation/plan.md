# Implementation Plan: spec 034 (R-66, R-68, R-70, R-71)

Design decisions are A-1…A-10 in `spec.md`; tasks in `tasks.md`.

## Order

1. R-68 mocks and the rating page (D-2): the owner rates them while the rest is built.
2. R-71 (dashboard only, no schema): pager, Prev/Next, store picker.
3. R-70: guard and grouping (no schema), `open_process_update`, Runs by process page.
4. R-66: one migration (0027, also R-68's samples), checkpoints, `go_to_state`, run types, marks,
   screens 14–15.
5. R-68 real export on the shared step resolver; dashboard tabs; eval.
6. Live checks on the test portals, code review, docs, push (no merge, D-3).

## Where things go

| Concern | Place |
|---|---|
| Checkpoints, recipe | `mcp-server/src/runtime/pipeline/run-path.ts` (record), `services/checkpoints.ts` (resolve) |
| `go_to_state` | `tools/index.ts` (shape) → `runtime/pipeline/go-to-state.ts` |
| Run types, plan | `services/start-run.ts`, `services/run-plan.ts` |
| Skip marks | `services/frontier.ts` (settle at pick time) |
| Marks (writes) | `apps/chat/src/marks.ts` |
| Scan briefs | `apps/chat/src/scan.ts`, `scan-briefs.ts` |
| Map marks, plan, recovery | `apps/dashboard/.../web/map.py`, `web/plan.py`, `queries_plan.py` |
| Pager | `apps/dashboard/.../pager.py` |
| Prev/Next | `apps/dashboard/.../neighbours.py` |
| Run grouping | `services/ba/run-groups.ts`, `queries_run_groups.py`, fixture `apps/crawler/tests/fixtures/run-groups/*.json` |
| Update mode | `services/ba/process-update.ts` |
| Guard | `services/ba/revision-guard.ts` |
| EARS | `docs-model/src/schemas/doc-content.ts` |
| Samples | `mcp-server/src/runtime/pipeline/network.ts`, `services/record-api-call.ts` |
| Step resolver, export | `docs/src/process-steps.ts`, `docs/src/render/process-export/` |
| CLI | `apps/crawler/scripts/` (`docs:process-export`) |

## Tests

Fast tier per change; slow tier for `runtime/**` changes (`go_to_state`, checkpoints, samples) and
the new gate cases; dashboard pytest; chat tests.
