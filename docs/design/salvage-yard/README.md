# MudPuppy · Salvage Yard: design package

> Tag it, strip it, ship it.

Everything needed to rebrand and rebuild the MudPuppy console in the **Salvage Yard** design
system: the brand book, design system and CSS library, detailed screens, the original wireframes,
screenshots, the frontend skill for your AI harness, and a migration guide from the current
Console style. It works offline: fonts are bundled and nothing loads from the internet. The one
exception is the original wireframes, which ask Google Fonts for IBM Plex Sans and fall back to system fonts offline.

**Open `index.html` in a browser to browse it all.** New: **MudPuppy 2.0** (`docs/12-v2-ux.md`, screens `v2-*`), the design answer
to spec 039 · R-81: one living model of the portal, What changed, Needs you, business rules.

## What's inside

```
mudpuppy-salvage-yard/
├── index.html                  start page: links and thumbnails of everything
├── README.md                   this file
├── AGENTS.md                   drop-in instructions for coding agents (merge into CLAUDE.md / AGENTS.md)
├── brand/
│   ├── brand-book.html         visual brand book
│   └── logo/                   mark-grid-path.svg · mark-creature.svg · mark-mono.svg · tag-icon.svg (favicon)
├── design-system/
│   ├── components.html         every component, live, with markup
│   ├── css/                    tokens.css → fonts.css → salvage.css (load in this order)
│   ├── fonts/                  Archivo (variable), IBM Plex Mono, Special Elite (WOFF2, subset, licences)
│   └── tokens/                 tokens.json (Console design-system list format) · tokens.dtcg.json (W3C DTCG)
├── screens/                    16 v1 screens (12–16: map runs) + 16 MudPuppy 2.0 screens (v2-01 … v2-16)
├── wireframes/                 the 12 redesign wireframes (.dc.html, open offline via support.js)
├── screenshots/
│   ├── screens/                1280px PNG of every detailed screen (visual-regression baselines)
│   ├── wireframes/             PNG of every wireframe
│   └── system/                 brand book, component library, process flow
├── docs/
│   ├── 01-brand-book.md        mission, personality, names, wordmark, mark, voice, misuse
│   ├── 02-design-decisions.md  why it looks like this (decision records + open items)
│   ├── 03-colour-guide.md      what each colour is designed to show, status matrix, contrast
│   ├── 04-design-system.md     foundations + every component's rules
│   ├── 05-css-guide.md         CSS architecture, ARIA state, tokens, lint, templates, JS duties
│   ├── 06-screens.md           each screen: purpose, regions, rules, acceptance
│   ├── 07-requirements.md      testable frontend requirements (FE-xx)
│   ├── 08-migration-guide.md   Console → Salvage: maps, plan, tips, migrating the skill
│   ├── 09-qa-checklist.md      PR and release checklist, visual regression setup
│   ├── 10-processes.md         the process redesign: lifecycle, flows, rules, diff, data model, API, scope migration
│   ├── 10-processes-flow.html  visual overview of how processes work now
│   ├── 11-map-runs.md          map runs: graph and marks, form probing, checkpoints and resume, directed scans, BA reconciliation
│   ├── 12-v2-ux.md             MudPuppy 2.0 UX: IA, time, vocabulary, review flow, overturn, before/after, decision tables, states, answers
│   └── 13-v2-fixtures.md       the 2.0 data story every v2 screen uses (seed for tests)
├── skill/mudpuppy-salvage-ui/  the frontend skill: SKILL.md + references/ + scripts/ (copy to .claude/skills/)
└── migration/
    ├── token-map.csv           Console (and never-shipped rust) tokens → Salvage roles
    ├── status-map.csv          [ OK ] [INT.] … → data-status + word
    ├── component-map.csv       Console components → Salvage classes
    └── find-old-styles.sh      greps a repo for Console-era styling (CI guard)
```

## Quick start

**People:** open `index.html` → brand book → component library → screens. Read `docs/02` and `docs/03` before arguing about a colour.

**Developers:**
1. Copy `design-system/css`, `design-system/fonts` and `design-system/tag-icon.svg` to the console's static folder (for example `static/salvage/`).
2. Load `tokens.css`, `fonts.css`, `salvage.css` in a new base template (`docs/05-css-guide.md`).
3. Follow `docs/08-migration-guide.md`: re-skin first, then the redesign, page by page behind a flag.

**Harness (Claude Code or similar):**
1. Commit this package to the repo (for example `docs/design/salvage-yard/`), then copy `skill/mudpuppy-salvage-ui/` to `<repo>/.claude/skills/mudpuppy-salvage-ui/` and set `DS_PATH` / `DESIGN_PKG` at the top of its SKILL.md.
2. Merge `AGENTS.md` into the repo's `CLAUDE.md`/`AGENTS.md`.
3. Retire any Console design-system skill (`docs/08-migration-guide.md` §9).
4. Add `migration/find-old-styles.sh` and the stylelint rules to CI.

## The system in one screen

- **Steel** ground with a 24px yard grid; solid square **plates**; no radius, no shadows.
- **Marker orange** = intent (brand, the primary action, needs you).
  **Manila** = records (tags) and people (typewriter notes).
  **Blueprint** = drawn, not built (dashed).
  **Inspected** = OK. **Coolant** = active now. **Failure** = failure only.
- **Archivo** (UI, prose, Expanded caps for short labels) · **IBM Plex Mono** (data) · **Special Elite** (people).
- Every status is **shape + word**: ■ happened · □ didn't yet · ⌜⌟ unconfirmed · ✕ broke.
- Voice: counts first, then the next move.

## Verified

- Every text pair meets WCAG 2.2 AA (`docs/03-colour-guide.md` §5); status colours checked under deuteranopia and protanopia simulation.
- All three fonts cover Polish (checked glyph by glyph).
- Every v1 screen renders offline at 1280 and 390, and every 2.0 screen at 1280 and 1024 (desktop-first, per the brief), with no page-level horizontal scroll and no console errors.

## Open items

Product decisions still needed: `docs/02-design-decisions.md` → *Open items* (notably O-1: the
"As-is only" product rule vs the new to-be workspace).

## Credits and licences

- Fonts: Archivo and IBM Plex Mono (SIL Open Font License 1.1), Special Elite (Apache License 2.0). Licence files are in `design-system/fonts/`.
- The pixel mudpuppy mark is the existing MudPuppy artwork, recoloured to this palette.
- Data in the screens comes from MudPuppy scans of the `reference-insurer` demo portal (all data fictitious) and `wikipedia` settings.
