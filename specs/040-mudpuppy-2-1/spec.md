# Spec 040: MudPuppy 2.1, the rest of 2.0 (R-93 UI, R-91 backend, R-75 scar-maker baseline)

Branch `feature/040-r91-r93-r75-mudpuppy-2-1` · 2026-10-22 · owner request (2026-10-22, before
leaving for the night): "Are there any more things regarding 2.0 you could do without my decisions
through the night? Could you lump them into one branch and start working on them?" Scope chosen by
the owner: R-93 UI leftovers, R-91 backend leftovers, R-75 scar-maker baseline. Merge and tag
v2.1.0 when green; paid trials up to about $20. Anything that needs an owner decision is parked on
the roadmap, not built (open points in `findings.md` and the session dump).

## Problem

2.0 (spec 039, v2.0.0) shipped the designer's pages on the read models that existed, and the owner
chose "pages first, then the gaps" (`specs/039-…/ux-gaps.md` § 4). The gaps half never started, and
the build notes F-48…F-55 of spec 039 list page parts left out. Eleven spec 039 tasks are only
partly built (R-91). The scar-maker eval has no baseline because numbered sections collapsed to
`/:param` (R-75), which 2.0's parameter roles claim to fix.

## Scope

**In (built without owner decisions; every item is drawn by the designer, `docs/design/salvage-yard/docs/12-v2-ux.md`, or specified in spec 039's design):**

- **UI, read models (ux-gaps G2, G4, G5, G6, G9, G10):** As of on model pages, Changes for a
  from–to range, Review groups with bulk decisions as one command and Undo, rule statuses in the
  designer's words with Reword, a why on each screen variant, per-release coverage.
- **UI, page parts (spec 039 F-48…F-55):** Review keyboard and filters, the Undo toast, the
  remembered reasons; Before / after decision bar and view modes; Screens filters and sort; Map edge
  labels and process triggers; All portals v2-15; Settings Hints editing and Budgets; Rules Copy
  Markdown and history; Same screen? τ-nearest queue; linked decisions (Also settles).
- **Backend (R-91):** the reconciler calls the miner when present (T062), contracts by schema hash
  in the export (T078), the headless driver's prefix cache and checkpoint starts (T021), planner
  marks (T054, T075), proposal edits as constraints of the next `model:propose` (T072), boundary
  tests as review rows (T063, without a schedule), scenario gates (T041, T066), the constitution's
  `model:import` wording.
- **Evals:** the scar-maker baseline (R-75) and one reference-insurer regression trial.

**Out (needs the owner):** Overturn stickiness and Undo of an overturn (R-87); a release poller (G3,
answered "no"); the weekly regression schedule (Q-3); the classifier's M6 gate (needs real pair
labels, R-85); every other R-86 proposal (the roadmap review is not rated yet).

## Requirements

- **FR-001 As of.** A header menu on model pages (Screens, Map, Processes, Rules) offers Now and
  each model version (labelled by release and scan). A past version shows the model as it was, a
  banner says so with "Back to now", and write buttons are disabled.
- **FR-002 Changes range.** Changes takes `from` and `to` model versions; it lists the deviations of
  every version in between. Default stays "since the previous release".
- **FR-003 Bulk decisions.** Review groups items of the same kind, explanation and release; a group
  decision is one command (all or nothing) and one Undo reverts it. Reject asks for one reason.
- **FR-004 Undo.** After a decision a toast says what was done with Undo; Undo appends an event (no
  history is deleted).
- **FR-005 Keyboard.** J/K/Enter/X/C/R/M/U and `?` on the Review queue, only while focus is in the
  queue or detail and never while typing; each has a visible button.
- **FR-006 Reasons.** The reason field suggests the last three reasons of the same kind.
- **FR-007 Rule statuses and Reword.** Rules show Proposed · Tested · Confirmed · Broken · Changed ·
  Replaced; a person can Reword the documentation sentence (stored as an event, exported).
- **FR-008 Variant why.** Each screen variant shows Release · Persona · Error · A/B test · Data ·
  Unknown from the hypothesis that explains it.
- **FR-009 Per-release coverage.** Screens and processes show "checked n / m on <release>".
- **FR-010 The remaining page parts** listed in Scope, each to the designer's drawing.
- **FR-011 to FR-017 Backend** as listed in Scope; each with tests.
- **FR-018 Evals.** Scar-maker baseline promoted; a reference-insurer trial at or above the v2
  baseline (else a finding).

## Success

All suites green (close-out tiers of `CLAUDE.md`), the code-reviewer's findings fixed or deferred,
CHANGELOG 2.1.0, merged and tagged v2.1.0, roadmap rows updated.
