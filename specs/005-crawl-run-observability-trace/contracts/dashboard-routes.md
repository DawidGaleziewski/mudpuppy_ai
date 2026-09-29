# Contract: dashboard trace views

Extends `specs/003-dashboard-ui/contracts/http-routes.md` (all rules there apply: GET only,
`?env=`, live regions re-fetch on `store-changed`, `push=1` for shareable filter URLs,
`Cache-Control: no-store`).

## Pages

| Route | Template | Content |
| --- | --- | --- |
| `/runs/{run_id}?tab=trace` | `run_detail.html` | tab bar gains `trace` (count = call spans); summary + call list |
| `/activity` | `activity.html` | run-less calls (FR-016), newest first; `cursor` |

## Fragments

| Route | Partial | Live? | Params |
| --- | --- | --- | --- |
| `/fragments/runs/{run_id}/trace/summary` | `partials/trace_summary.html` | yes | — |
| `/fragments/runs/{run_id}/trace` | `partials/trace_calls.html` | yes | `tool` (repeatable), `status` (repeatable: `ok`,`refused`,`stopped`,`error`,`unfinished`,`running`), `problems=1`, `cursor` |
| `/fragments/spans/{span_id}/children` | `partials/trace_children.html` | no (loaded on expand) | `kind` (repeatable: `phase`,`event`), `name` (repeatable) |
| `/fragments/activity` | `partials/activity_rows.html` | yes | `cursor` |

## Call row (`trace_calls.html`)

`seq` · tool · rationale (labelled agent-stated) · status badge · duration · agent tokens for the
issuing turn · problem markers (error, refused, stopped, unfinished, stabilization timeout, slow
> run p95, unmatched agent call) · expand control (`hx-get` children, `hx-swap="innerHTML"` into the
row's detail region). Expanded detail shows: preceding agent text, input and output JSON (collapsed
`<details>`), `payload_ref` link text, phases as a proportional bar plus nested list, events inside
each phase, and, when `pw_trace_path` is set, the path and a copyable
`npx playwright show-trace data/<path>` command. Between-calls events appear as their own rows at
their position.

"Never reached server" agent calls appear as rows at their transcript position with a distinct
badge and no expand.

## Summary (`trace_summary.html`)

Total calls by tool and status; time per phase (sum, p50, p95); slowest 5 calls (links); tokens
(input, output, cache read) and turns; health (dropped, truncated, unfinished, unmatched both ways);
trace level and Playwright-trace flag of the boot(s).

## Empty states

No spans for the run → "No trace recorded for this run (it predates tracing or never reached the
server)." No agent import → the agent columns show "not imported" with the CLI command.

## Accents

Status and kind badges extend the mapping table in `specs/003-dashboard-ui/contracts/ui-conventions.md`
(owner `frontend-dev`, tokens only).
