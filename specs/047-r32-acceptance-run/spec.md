# Spec 047: the 2.0 acceptance run with the real agent (R-32)

**Branch:** `feature/047-r32-acceptance-run` · **Owner (2026-10-22):** go-ahead with a **$10 cap**;
re-scoped by R-86 as: a guest scan from the chat, narrow to one process, document, export, then
change the portal, re-scan, check Changes and the export.

## How it ran

The chat service (`MUDPUPPY_ENV=local-dev`, the owner's Claude Code login) and the reference
portal (`reference-insurer-local`, a clean portal in the local-dev store), driven through the
chat's HTTP API one message at a time (a scratch driver following the conversation's events until
`idle`), with a cost meter over the agent transcripts (Opus 5.5 prices) checked every minute.
Conversation `01a16614-76ab-7000-907f-612c69eb838b`.

| Step | What was asked | What happened | Cost |
|---|---|---|---|
| 1 | "Scan the whole portal as guest" | the assistant asked whether to load images first (F-05) | $0.31 |
| 1b | "Load images. Start the scan." | full map scan, 49 steps, 22 screens, a correct summary and next steps | $0.94 |
| 2 | "Document the car calculator, dane pojazdu to Twoja składka; set the scope" | `set_process_scope`: the four steps, the end and what is left out, right | $0.09 |
| 3 | "Start the as-is documentation" | 66 draft records in 10 min 56 s (SC-005: under 10 min, missed by a minute) | $2.73 |
| 4 | portal changed (`deployment`, `renamed-button`), "fresh map scan, what changed" | it found the new field and the renamed button, but the model read a new screen and two decision points (F-02, F-03) | $1.11 |
| 5 | "Update the documentation from the new scan" | the update describes the change; it also documented every other screen (F-04) | $4.02 |
| | | **total** | **$9.20** |

## Checks

- [x] Guest scan from the chat: complete map, no refusals, a correct summary.
- [x] Narrow: the scope is the four calculator steps; the assistant names what it left out.
- [~] SC-005: 10 min 56 s of chat time (target under 10); 65 of 66 records cite in-scope evidence
      only: NFR-001 ("every page sends a page-view to analytics") cites the home page's call (F-01).
- [x] Export before and after the change: the second export shows "Liczba drzwi" as a variant
      field of step 1 and "Przejdź dalej" as its submit, with an open question about the field.
- [~] Changes: the change was found, but explained as a new screen and two R7 decision points
      (F-02 fixed in this spec, F-03 open); the BA's own hypotheses H-0003 and H-0004 read it
      right (same step, a release).
- [ ] SC-007, SC-008 (amendments superseded by the re-scan): out of the re-scoped run, not done.
