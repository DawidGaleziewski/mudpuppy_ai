# AGENTS.md: MudPuppy UI (Salvage Yard)

Instructions for AI coding agents and harnesses working on the MudPuppy console UI.
Merge this into the repo's `CLAUDE.md` or `AGENTS.md`.

## Rule zero
All UI work uses the **`mudpuppy-salvage-ui`** skill (`.claude/skills/mudpuppy-salvage-ui/`).
Never use Console-era styling: amber `#FFB000`, JetBrains Mono, scanlines, glow, round status dots,
bracket statuses like `[ OK ]`, or the `mudpuppy://console` wordmark.

## Where things are
- Design system in the repo: `static/salvage/` (`css/tokens.css`, `css/fonts.css`, `css/salvage.css`, `fonts/`). Copied from this package's `design-system/`.
- Target designs: this package's `screens/NN-*.html` and `screenshots/screens/NN-*.png`.
- Requirements: `docs/07-requirements.md` (cite FE-IDs in PRs).
- Processes feature (behaviour, rules, data model, API): `docs/10-processes.md`.
- Map runs (graph, marks, probing, checkpoints, resume, directed scans, reconciliation): `docs/11-map-runs.md`, screens 12–16.
- MudPuppy 2.0 (one living model; What changed, Review with Needs you / Explained automatically / Overturn, Screens with variants and identity, Map now, Processes proposed, Business rules as decision tables): `docs/12-v2-ux.md`, screens `v2-01`…`v2-15`, fixture `docs/13-v2-fixtures.md`, requirements `docs/07-requirements.md` §F (UX-R ids).
- Workbench (generative UI beta): spec and phased plan `docs/14-workbench.md`, rules `docs/15-genui-guidelines.md`, components
  `docs/16-genui-components.md` + `design-system/genui-components.html`, engineering and ADR `docs/17-genui-architecture.md`,
  screens `wb-01`…`wb-10`, contract `workbench/schema/` (regenerate with `workbench/tools/gen_wb_schema.py`, never edit the JSON),
  reference app `workbench/reference/`, requirements `docs/07-requirements.md` §G (FE-W ids).
- Migration plan: `docs/08-migration-guide.md` (track 1 re-skin first, then track 2 redesign).

## How to work
1. Find the reference screen for the page you're changing. Copy its structure and classes.
2. Compose from `sy-` classes. Product-only layout classes use the `mp-` prefix. No hex, no fonts, no radius or shadows in templates or app CSS.
3. Map statuses through the single status helper (`migration/status-map.csv`). Wrap record IDs with the tag helper and human text with the note helper.
4. At most one primary button and at most one intent plate per view.
5. Keep server rendering. JS only for the jobs listed in `docs/05-css-guide.md` §8 (drawer, context switch, search, tabs, dialogs, toasts, meter updates).
6. Workbench: the model never writes markup. Add a component only through the catalogue (`docs/16-genui-components.md` "How to add a
   component"): CSS in `genui.css`, a Jinja partial, the schema entry, evals, docs. Never render a model string with `|safe`. Every
   write is a command card. Live data goes over SSE, never through the model.

## Definition of done
- `migration/find-old-styles.sh <changed paths>` → 0; stylelint → 0.
- Screenshots at 1280 and 390 (reduced motion), with no page-level horizontal scroll, attached to the PR.
- axe-core: 0 serious or critical. Keyboard pass.
- PR lists the FE-IDs covered.

## Ask a human before
- Adding a colour, font, radius, shadow or animation.
- Changing a meaning in `docs/03-colour-guide.md` or a decision in `docs/02-design-decisions.md`.
- Shipping a 2.0 decision marked "Proposed" (D-30…D-35) or an open item OV-1…OV-5 without the product owner's yes.
- Workbench: adding a catalogue component, path or command; changing the system prompt or tool definitions without running the evals;
  letting commands run outside sandbox; sending screenshots or input values to the model (D-36…D-43, open items OW-1…OW-8).
- Running technical probes anywhere but sandbox, or changing what a probe may submit (open items O-M1…O-M5 in `docs/11-map-runs.md`).
- Building the to-be features (screens 05–07: editing the to-be, compare, history) before open item O-1 ("As-is only" product rule) is resolved. Screen 04 (process list and groupings) is not blocked.
