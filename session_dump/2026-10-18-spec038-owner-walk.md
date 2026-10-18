# Session dump 2026-10-18 (3): spec 038, built while the owner was on a walk

Branch `feature/038-grouping-eval-crawler-gaps` (worktree `../pathfinder-ai-038`; the main checkout
is back on master so the running dashboard and chat service never load this branch's code or a
migration). Not merged, not pushed.

## Done (committed)

| Task | What | Commit |
|---|---|---|
| T001 R-78 (6) | the regroup click: a link's text reaches the chat it opens; a busy assistant queues it visibly | ba17a9a |
| T002 R-35 LO-35 | the gap could never pass (two stores); gate; one screen with revisions across runs (seeded fingerprint index) | 75e95bd |
| T003 R-35 S11 | unnamed links: `link (no name) to <path>`, `link_to`, crawler prompt line | 75e95bd |
| T004 R-36 LO-48 | unnamed fields carry their visible label; trace gate | 75e95bd |
| T005 R-36 LO-47 | `date-range` probe; trace gate; probes cannot return on a server-side wizard step (F-03) | 75e95bd |
| T006 R-58 (3) | shared menu buttons clicked once (the bank's logout cost 14 turns) | 75e95bd |
| T007 R-78 (5) | grouping eval `apps/chat/evals/`, 3 trials + baseline: found 80 %, clean starts 75 % | 9b09d31, 3289dbd |
| T009 | close-out: slow tier green, code review, roadmap, glossary, changelog | this commit |

## Parked

- **T008 R-65 (5) `api_endpoint`** on `feature/038b-api-endpoint-kind` (656083c): complete, one
  test red on purpose (needs a row in the frozen `ba-practice/references/record-kinds.md`).

## Questions for the owner (in order of what they unblock)

1. **F-01@038, review the cross-run screen behaviour.** A page whose structure changed a little
   since the last scan (similarity ≥ 0.9) is now the next revision of its screen, not a new screen.
   That is the "one screen with variants" decision, and spec 022's revision model working across
   scans. OK to keep before merge?
2. **R-77 + R-65 (5):** may the `api_endpoint` row go into `ba-practice/references/record-kinds.md`
   now, or after your review of the skill?
3. **R-78 (4):** the eval shows the assistant (a) starts a process on the page the user came from,
   (b) misses a process behind a login wall and suggests "Log in" instead, (c) names processes in
   English on a Polish portal. Fix in the orchestrator prompt now (and rerun the eval), or wait
   for the R-77 / R-78 discussion (C1–C7)?
4. ~~**F-03@038:** probes on wizards that keep their step on the server~~ **Answered 2026-10-18**
   ("do it this way": A falling back to B); built as T010 (a new session when the way back
   diverges), gate F-03@038; F-07 logged (messages without an alert role).

**Other answers (2026-10-18):** 1 → R-79 on master (re-discuss how scans are stored and
reconciled; F-01 waits for it or is accepted on its own); 2 → parked until R-77 (R-65 (5), R-77
point 4); 3 → parked until R-77 and R-78 C1–C7 (R-78).
5. **Merge:** merge spec 038 to master yourself after 1, or should I (changelog entry is written)?

## Not done / follow-ups

- The deferred review findings: `apps/chat/CLAUDE.md` 70 lines, `mcp-server/CLAUDE.md` 130 lines.
- A gate for R-58 (3) on the bank estate (unit-tested only); a bank eval trial to measure turns.
- `pnpm stability` and mutation testing on the fingerprint kernel (`seed` added, nothing that
  computes a fingerprint changed) were not run.
- The `date-range` probe names LO-47 instead of a scar of its own (SC-25 would be a date form
  without server state).

## Live state

- Dashboard (127.0.0.1:8765), chat service (4310, sandbox), reference portal (4010) still running
  from the main checkout for the owner; their PIDs: dashboard 946499, chat 906330, portal 911744.
- Eval workspaces kept in `/tmp/pf-grouping-reference-insurer-*` (the trials' outcomes).
