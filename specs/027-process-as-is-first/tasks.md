# Tasks: Processes, as-is first (spec 027, R-54)

## Phase 1 — store and chat service

- [x] T001 Migration 0028 (archived_at, record_key, as_is_rev, 'archive'/'unarchive'/'edit'),
      up/down/up checked; snapshot, data/schema README, spec 022 data-model.md
- [x] T002 Zod (`chat-model` ba-process.ts), Kysely types, dashboard models (with defaults)
- [x] T003 `writeProcess` shared head write; a stage change records `as_is_rev`
- [x] T004 Archive / unarchive routes (409 UNCHANGED)
- [x] T005 Edit A route (`editedSteps`, `editNote`, `usedStepIds`)
- [x] T006 From-record route (`process-from-record.ts`)
- [x] T007 Tests: chat processes + from-record; store migration lists; chat-model enums
- [x] T008 Contract rows in spec 022 `contracts/processes-api.md`

## Phase 2 — dashboard

- [x] T009 Read models: archived filter, loose screens and grouping inputs without archived
      processes, sign-off state, per-step documentation, pictures per screen
- [x] T010 Forwarder admits archive, unarchive, variants/A/edit, from-record
- [x] T011 Processes list: Archived filter with Restore; thumbnails + picture dialog; tick order
      with ↑ ↓ remove
- [x] T012 Process page head: stage control, Mark as-is documented, changed-since notice, still
      open, Archive / Restore
- [x] T013 As-is documentation view of A (per step picture and records; side panel)
- [x] T014 Edit A: ↑ ↓ remove and Add screen (one edit revision each)
- [x] T015 Docs PROC page: Open in Processes; PRC shows "documented as PROC-…"
- [x] T016 Dashboard tests; UI check 1280/390 (list, process, selected step: ok); browser check
      of the picker order and the picture dialog on a migrated copy of the sandbox store; the
      writes are covered by the chat service tests (the chat service migrates the real store on
      start, so it was not run before the merge); how-to-use, glossary (2 entries)

## Close-out

- [x] T017 code-reviewer (1 fixed, 1 deferred, 1 rejected), findings, roadmap R-54 row,
      changelog, merge. Close-out tests: chat 285 pass; dashboard all pass; crawler `pnpm test`
      2197 pass, 6 browser-timing failures that master shows too on this machine (F-01)
