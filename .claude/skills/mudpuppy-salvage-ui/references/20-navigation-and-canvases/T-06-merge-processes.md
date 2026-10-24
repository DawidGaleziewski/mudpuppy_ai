# T-06 · Merging two saved processes

**Answers:** Q3 · **Size:** M · **Depends on:** T-05's selection bar · **Screens:** `screens/v2-20-merge-processes.html`

## Decision

**Yes, a person may merge two saved processes, when they are for the same persona. One absorbs the other** (no new process).

| Question | Answer |
|---|---|
| **Allowed?** | Yes, for two saved processes with the **same persona**. Different personas: the button is disabled with the reason "Processes for different personas can't be merged: compare them instead" (a process is one persona's path; a persona difference is a variant of the screens, not of the process) |
| **One absorbs the other, or a new one?** | **One absorbs the other.** You choose which to keep; default: the one you started from, or on the list the one with more steps / documentation. It keeps its key (PROC-001), its links, rules, docs and history. The other is **archived as "Merged into PROC-001"**: read-only, its URL redirects, its history stays readable |
| **Name** | Defaults to the kept one's; editable in the dialog. The absorbed name is kept as an alias (search finds it, old links say "now part of …") |
| **Persona** | The same in both (checked) |
| **Start and end** | Each process has one start and one end (BR-011). The dialog asks which to keep when they differ; the other start / end become included screens |
| **A (as-is)** | **Rebuilt from observations** for the merged scope (the union of both scopes) → a new A revision of the kept process ("A r5 · merged scope"). Never stitched by hand |
| **B… (to-be)** | The kept process's to-be variants stay. The absorbed process's to-be variants **move over with the next letters** ("D · from Test process") and are marked **"branched from another as-is"**: they must be re-based before Compare uses them. Nothing is merged inside a to-be |
| **Docs** | The absorbed PROC record is marked "merged into PROC-001" and goes to Review ▸ Records to confirm |
| **History** | One event in both histories: who, when, the reason (optional), what moved |
| **Undo** | The toast's **Undo** for 10 s puts everything back exactly. Later: **Split back** on that history event restores the absorbed process (its own scope and A revisions, and its to-be variants as they are now, edits since the merge included) and adds an A revision to the kept one |
| **Where** | (1) Processes list: tick **exactly two** → selection bar **Merge 2 processes…**. (2) The process page's actions: **Merge with…** → pick the other process. Both open the same dialog |

## The dialog

```
MERGE 2 PROCESSES
Keep  (•) Oblicz składkę OC/AC · PROC-001 · guest · 6 steps · A r4, B r2, C r1 · documented
      ( ) Test process · PROC-003 · guest · 2 steps · A r1, B r2
Name [Oblicz składkę OC/AC]   Start [Ubezpieczenia dla Ciebie · / (both)]   End [Kalkulator OC/AC — wynik ▾]
Persona  guest in both ✓
Scope    7 screens: the 6 of Oblicz składkę OC/AC + Samochód from Test process
As-is    Rebuilt from what scans observed → A r5. No hand edits
To-be    Test process's B r2 moves over as D · from Test process, marked "branched from another as-is"
Docs     PROC-003's record is marked "merged into PROC-001" (Review ▸ Records to confirm)
Undo     Undo in the toast for 10 s; later, Split back in History
Reason (optional) [ … ]
                                              [Cancel]  [MERGE INTO OBLICZ SKŁADKĘ OC/AC]
```

The facts list is computed by the server for the chosen pair (a dry run), so the person sees exactly what will happen.
The primary button names the result. Parts: `.sy-dialog`, `.sy-choice`, `.sy-facts`, `.sy-btn--primary`.

## API (sketch)

`POST /portals/{p}/processes:merge {keep, absorb, name, start, end, reason, dry_run}` → the facts above (dry run) or the
result. `POST /portals/{p}/processes/{keep}/history/{event}:split-back`.

## Acceptance

- Merging Test process into Oblicz składkę OC/AC keeps PROC-001's key and links, creates A r5, moves B as D, archives PROC-003
  with a redirect, and both histories show the event.
- Different personas: the action is disabled with its reason.
- Undo within 10 s restores both exactly; Split back later restores the absorbed process.
