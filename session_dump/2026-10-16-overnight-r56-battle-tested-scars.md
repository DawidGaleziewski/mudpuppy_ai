# Session dump 2026-10-16 (overnight): [battle-tested-scar] R-56 … R-65 on one branch

Owner: "pick all the roadmap items … start working on them on one branch. If any issues happen
move them to the end. Prioritise the scar ones." Mid-run additions: intermittent error pages
(SC-17) and a three-step form with validators, disabled buttons, Back and a success/error page
(SC-18). Branch `feature/030-r56-battle-tested-scars` (spec 030), pushed, **not merged**: the merge
and the changelog wait for you (the roadmap category is new and several decisions are yours).

## Done (commits on the branch)

| Commit | Items | What |
|---|---|---|
| 2510540 (master) | roadmap | `[battle-tested-scar]` category R-56…R-66, D-1/D-2 decisions, `docs/discussions/r62-transit-zones.md` |
| 058b286 | R-56, R-57 | `apps/scar-maker` (Node, two loopback hosts), `scars.yaml`, scar gates; C-2 anchors vs one-big-form, C-1 403/429 main document only, German keywords |
| 82e7577 | R-58, R-59 | SC-07 (master already holds), crashed `act` retires its item; `@pathfinder/fix-plugins` (seed-cookie, expand-collapsed, wait-for-mount, detect-stack), `fixes:` in the portal file; `__name` shim for hooks |
| 97194ff | R-60, R-61, R-62 | render warnings, transient error pages, three-step form; free environment names (migration 0021), `PATHFINDER_ENV` required, environment on every result, stray-server registry; login: condition wait, input/change/blur, `pending`, static-file budget |
| 2dbf482 | R-57 SC-06, R-63, R-64, R-65 | slow tiles; `network.proxy` + `portal:doctor`; `traces.yaml` + `portal:trace`; narrow warning, BA run selection, docs quality flags; scripts take `--env`; scar-maker eval task |
| 89f7055 | close-out | glossary (6 new entries, environment rewritten), roadmap rows, this dump; code-reviewer pass (4 fixed, 13 deferred); `docs:review` on existing stores (F-15) |
| 4a2c94c, last | eval | scar-maker trials 1 and 2, ground-truth fix, F-16 |

Every scar SC-01…SC-18 is a gate. Slow tier (all gates + e2e) green on every commit: 82e7577 (90
pass), 97194ff (96), 2dbf482 (99) and 89f7055 (99 pass, 0 fail, 5 known proving-ground gaps).
Fast tiers, chat (255), workflow (29), dashboard and exportfork-export green.
Each fixed scar was first run on the previous commit to prove it failed there (F-09, F-12).

## Open for you (decisions)

1. **Merge?** Squash to master, tag, export export-fork (the export no longer pins `production`;
   the field user must set `EXPORTFORK_ENV`).
2. **R-62 Q3 transit zones** (declared, learned, or both): `docs/discussions/r62-transit-zones.md`.
3. **D-8:** `start_session` only *warns* when trace runs are ungrouped. Refuse instead?
4. **D-9:** rename the two "processes" pages and cross-link doc records to reconciled processes.
5. **A sub-resource 429** no longer stops the run; should it slow the limiter instead? (F-03)
6. **Defaults that remain** (F-11): vault CLI `sandbox` fallback, the chat credentials endpoint
   default `sandbox`, `.mcp.json` names `sandbox` explicitly. Keep, or require them too?
7. **Eval baseline**: two crawler-only trials of `scar-maker` ran ($0.8 each): 54.3 % of 46 screens
   after a ground-truth fix. The rest is a real finding (F-16): numbered section paths
   (`/sc01`…`/sc18`) collapse to `/:param`, and the trap guard then stops the exploration. Decide
   with R-50 whether a numbered segment is an id or a section; promote a baseline after that.
8. **Deferred guideline findings** (code-reviewer: old hubs this branch grew, e.g. `classifyAction`,
   `createRequestGate`): a maintainability follow-up?

## Not done / moved to the end

- The shared condition wait in navigate/act/mounts (only login uses it; F-10).
- R-58 batch drain and shared-nav dedup; R-63 CA trust beyond `ignore_https_errors`; R-64 run
  tagging for `narrow` and per-variant flowcharts; R-65 (2) cross-link, (5) `api_endpoint` kind;
  R-66 map from a known screen; GC-10 (persona id masked) not checked.
- Dashboard header showing the environment beyond its store picker.

## Slips (logged in findings)

- F-04/F-14: two text-replacement edits of tracked files (Python, `sed -i`) and a heredoc append
  the hook caught; Edit/Write only since.
