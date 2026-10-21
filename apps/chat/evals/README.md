# Grouping eval (`apps/chat/evals/`)

How well the assistant cuts a portal's recorded scans into processes (R-78 (5), spec 038 FR-002).
It copies the crawler eval's shape (`apps/crawler/evals/README.md`, terms G-33); the differences
and their reasons are below.

## Run

```
pnpm --dir apps/chat eval reference-insurer [--store <workspace>] [--budget-usd 2] [--model <m>]
                                            [--promote] [--dry-run]
```

- **Input (the scans)**: a finished crawler-eval workspace, by default the newest
  `pf-eval-<portal>-*` in the temp folder (map + process traces of the reference portal). Its store
  is copied into a fresh workspace (`pf-grouping-<portal>-*`) with **every grouping taken out**
  (suggestions, BA processes and their process models, process scopes): the assistant starts where a
  person stands after scanning, before the narrow step. The source is only read.
- **The trial**: one headless `claude -p` session with the orchestrator's own system prompt
  (`apps/chat/agents/orchestrator.md`), the chat service's fresh-session handover and exactly what
  the "Ask the assistant to regroup" button says. Only the chat server's `list_grouping_inputs` and
  `suggest_grouping` are allowed; the built-in tools are off, so it cannot read the ground truth.
- **Outcome**: the open `grouping_suggestions` in the workspace store. The workspace is kept for
  reading (removed only after a dry run).
- `--dry-run` builds the workspace and grades the empty outcome (everything 0) without a paid call.

## Graders

| Group | Name | What |
|---|---|---|
| goal | `processes_found` | ground-truth processes a suggestion covers: its screens walk every observable step in order (steps up to `last_observable_route`); processes whose first screen no scan recorded are left out of the total and named in `detail` |
| goal | `clean_starts` | covering suggestions whose first screen is the process's own first screen, not the page the user came from (R-77) |
| diagnostic | `why_cites` | suggestions whose `why` quotes a followed link or button name, or one of its routes |
| diagnostic | `duplicates`, `stubs`, `extra_screens`, `unmatched`, `error_screens_inside` | more than one suggestion per process, one-screen suggestions, screens that are not steps of the process, suggestions covering no process, error pages inside |

Code-based only (`graders/code/grouping.ts`); `graders/model/` and `graders/human/` are empty on
purpose (see their READMEs).

## Differences from the crawler eval, and why

- **Results** go to `data/evals/grouping-<portal>/`, not `data/evals/<portal>/`: the crawler eval
  already owns that folder for the same portal.
- **Own result shape** (`results.ts`, `TrialRecord`), not the gates' `EvalResult`: that schema is
  built around a crawl (crawl screens, traces, the BA's records), none of which is measured here.
- **No portal server**: nothing is browsed; the scans are input.
- **No tolerances yet**: set from the spread of a few trials, then a baseline is promoted.

## Known gaps

- One task (reference insurer, guest scans). A logged-in portal and a field-sized store (many
  loose runs) are the next tasks.
- The outcome depends on the source store: record which one (`conditions.source_store`) and compare
  trials on the same store only.
