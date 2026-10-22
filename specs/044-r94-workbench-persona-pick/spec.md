# Spec 044: pick the persona on the Workbench's Start card (R-94, F-18 of spec 043)

**Branch:** `feature/044-r94-workbench-persona-pick` · **Owner ask (2026-10-22):** "in
confirmation we need to actually allow user to pick persona in the widget. It shouldn't be like
this. We should be able to just start the scan. If not we will need a widget for adding new
persona (for now add this as new requirement on roadmap)."

## Problem

The owner's hand try on a fresh `local-dev` store (`WB-edbf581a`, `WB-099af97d`): "Start a map
scan" → Confirm → "the scan needs more information". `scan.start` took the persona only from the
portal's newest run (spec 043 `prepareStart`), so a portal's first scan could never start from
the Workbench, and the card did not say what was missing.

## Requirements

- **FR-001 Persona on the card.** A proposed `scan.start` card of type `full_map` shows "As" with
  a choice of the portal's personas (`personas/<portal>/*.yaml`, the list the chat's scope check
  accepts), inside the Confirm form. Nothing is sent before Confirm, as before (WB-UI-21).
- **FR-002 Default.** The choice starts on the persona of the portal's newest scan; with no scan,
  on `guest`; with no `guest`, on the first persona by name. One click on Confirm starts the scan.
- **FR-003 No persona.** A portal without any persona shows "This portal has no persona yet" with
  a link to its settings, and no Confirm. Adding a persona from the Workbench is R-95.
- **FR-004 Confirm takes the choice.** The chat's confirm accepts an optional `persona`; it must
  be a persona id (`[a-z0-9][a-z0-9_-]*`, ≤ 64) and a file of the portal, else the command fails
  with the reason. Without one, the chat uses the same default as FR-002. A resume or a
  `continue_frontier` start keeps its run's persona and ignores the field.
- **FR-005 Say what is missing.** A refused scan command's message names the missing items
  ("the scan needs more information: persona"), on the card and in the store.

The designer's contract (`commands.json`) is unchanged: the persona is the person's choice at
Confirm, not a model argument. The run row records it (`runs.persona_id`), so the audit holds it.

## Out of scope

- Creating a persona from the Workbench (new roadmap row R-95).
- The header offering portals that do not declare the store's environment (F-18 (b)): noted, in R-94.

## Validation

- [x] Chat: confirm with a chosen persona starts the hand-off as that persona; without one on a
      portal with no runs, as `guest`; a persona of another portal or an unsafe id fails with the
      reason; a missing-input refusal names the item.
- [x] Dashboard: the proposed Start card lists the portal's personas with the default selected;
      the choice is forwarded on Confirm; no persona → the note and no Confirm.
- [x] Owner hand try: "Start a map scan" on `proving-ground-shop-local` (no runs) starts a scan
      (2026-10-22: scan `01a16518` as guest, "Done · Started scan 01a16518"). The same try found
      that no live card follows (spec 043 F-19, now R-96).
