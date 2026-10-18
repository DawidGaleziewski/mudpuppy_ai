# Plan: Processes, as-is first (spec 027, R-54)

Built 2026-10-18 on `feature/027-r54-process-as-is-first` (recreated from master; the 2026-10-14
draft commits were already on master through spec 034). US5 and US6.1 are R-68's export (spec
034), so this plan covers US1–US4 and US6.2–6.3.

## Store (migration 0028_process_archive_edit)

- `ba_processes.archived_at` (NULL = in the list) and `ba_processes.record_key` (the PROC record
  it was opened from).
- `ba_process_revisions`: `change` gains `archive`, `unarchive`; new `as_is_rev` (the A revision
  a `stage` change signed off). Rebuilt (CHECK list), every row kept.
- `process_variant_revisions.change` gains `edit` (a person's edit of A). Rebuilt likewise.
- Snapshot, Zod (`chat-model`), Kysely types, dashboard models (defaults, so a store one migration
  behind still reads), spec 022 data-model.md.

## Chat service (writes; contracts/processes-api.md of spec 022)

- `writeProcess` in `process-store.ts`: the one head write for rename, stage, archive, unarchive.
- `POST …/processes/:id/archive`, `…/unarchive` (409 `UNCHANGED` when already so).
- `POST …/processes/:id/variants/A/edit` `{base_rev, state_ids[]}`: kept screens keep their step
  (id, annotations), new ones get an `sN` id no revision of the variant used; the note says what
  changed; 409 `UNCHANGED` for no change, 409 on a to-be.
- A `stage` change records A's head as `as_is_rev`.
- `POST …/processes/from-record` `{record_key}` (`process-from-record.ts`): A from
  `resolveProcessSteps` (the export's walking order), named and persona'd from the record; a
  second call answers the linked process (`existing: true`).

## Dashboard (read models and pages; writes forwarded, signed with the reviewer)

- `queries_processes`: archived processes out of the list, the loose screens and the grouping
  inputs; `archived=1` lists them; the sign-off (`signed_rev`, "changed since documented"); per
  step documentation for the as-is page (records citing the screen by kind, amendments, open
  questions); screenshot and wireframe refs per screen.
- `/processes`: thumbnails on "In no process" (dialog with Screenshot / Wireframe, Open screen
  page), tick order with ↑ ↓ remove, an Archived filter with Restore.
- `/processes/{PRC}`: on `scoped` / `as_is_documented` A leads as documentation (per step its
  picture and records; the side panel shows the selected step's documentation); the head has the
  stage control, Mark as-is documented, the "changed since documented" notice, what is still
  open, Archive; A's steps can be reordered, removed and added (one `edit` revision per change).
  To-be controls stay, quieter, as "Start a to-be design".
- Docs PROC record page: **Open in Processes**; a PRC opened from a record shows "documented as
  PROC-…" with a link back.
- `WRITE_PATH` in `web/processes.py` admits the new routes.

## Tests

- chat: `processes.test.ts` (archive/unarchive/sign-off, edit A), `process-from-record.test.ts`.
- crawler: store migration lists, chat-model enums (0028's lists).
- dashboard: list filter, as-is page, picker and dialog markup, the forwarder paths, the record
  link; UI check at 1280 and 390 on the list and a process.
