# T100 step 1: the designer's 2.0 package against the brief and the build (2026-10-20)

Package: `user_input/MudPuppyRebrand/mudpuppy-salvage-yard (3).zip` (screens `v2-01`…`v2-16`,
`docs/12-v2-ux.md`, `docs/13-v2-fixtures.md`, the updated `mudpuppy-salvage-ui` skill, design-system
CSS with the eight 2.0 components). Brief: `ux-requirements.md` (UX-R01…R90).

## 1. Brief → package: nothing missing

Every P1 requirement has a screen; the P2 ones have notes (§ 10 of `12-v2-ux.md`).

| Brief | Screens / section | Covered |
| --- | --- | --- |
| UX-R01–R03 Home, release, counts, no-marker warning | v2-01, v2-15, states | yes |
| UX-R10–R14 Changes, range, grouping, explanation, before/after, release lanes | v2-02, v2-03 | yes |
| UX-R20–R24 one review queue, Explained automatically, filters, bulk | v2-04, v2-05, v2-16 | yes, plus a Decided tab (audit) |
| UX-R30–R34 screens, variants with why, actions, history, Same screen? | v2-06, v2-07, v2-14 | yes |
| UX-R40–R44 map now, link states, overlays, one scan's path, scale | v2-08 | yes |
| UX-R50–R54 proposals, trigger/outcomes, paths, explored, rules | v2-09, v2-10 | yes |
| UX-R60–R63 rules, decision table, tests, confirm/reject/reword | v2-11, v2-12 | yes, plus the export shape (§ 7.2) |
| UX-R70–R72, R80–R81, R90 (P2) | notes § 10 | notes only, as agreed |
| Brief § 6 states | v2-13 | yes |

## 2. Package → build: what the pages assume that 2.0 does not have yet

| # | The page assumes | Today (branch) | Gap |
| --- | --- | --- | --- |
| G1 | **Overturned**: a person replaces an automatic explanation; sticky (the rule never explains that change the same way again); Undo | Hypotheses can be confirmed or rejected; a derived (rule-confirmed) one has no "overturn" move, no stickiness, no undo | lifecycle move + suppression per rule and change, undo event |
| G2 | **As of** (Now / a release / a scan) on every model page, writes disabled in the past | Model versions and membership intervals exist; no read model "as of" | read models by model version |
| G3 | **Release watch**: release markers polled every 30 min without a scan | Releases come only from scans (`builds`, `build_epochs`) | a new background poller (not in design.md): owner decision |
| G4 | Changes between any *from* and *to* (release, date, scan) | Deviations are per pair of consecutive model versions | range = deviations of the versions between |
| G5 | Review groups of similar items, bulk Confirm/Reject/Overturn (one command, undo as a whole), last three reasons remembered, "Also settles" bundles | One decision per hypothesis (`pnpm model:decide`, What changed page) | grouping, bulk command, linked decisions |
| G6 | Rule statuses Proposed · Tested · Confirmed · Broken · Changed · Replaced; **Reword** | proposed, testing, supported, refuted, confirmed, rejected, superseded; no wording field | status mapping (Tested = supported, Broken = open rule mismatch, Changed/Replaced = superseded by drift / by another) + a reworded sentence |
| G7 | Rules keyed **BR-nnn** | Rules are hypotheses `H-nnnn`; BR records are the BA's | which key the UI shows (owner) |
| G8 | Processes: Accept · Rename · Split · Merge · Move screens · Reject (reason); later proposals arrive as suggestions on an edited process | Accept / Edit first / Dismiss of suggestions (v1); no split, merge, move | process editing commands |
| G9 | Screen variants with a **why** (Release · Persona · Error · A/B test · Data · Unknown) | Members carry no reason; hypotheses do (structural_drift, context_variant, ab_test, flaky…) | map hypothesis kinds to the six whys |
| G10 | "Checked 8 / 11 on 9c21", link states incl. **Replaced → new** | Action class status (active, not_seen_since, untested, retired); `replaces` hypotheses | read model only |
| G11 | Settings ▸ Hints (release marker, A/B cookies, business refusals) and Budgets | Portal hooks and config files; `MODEL_DEFAULTS` | per-portal settings UI and storage |
| G12 | The assistant **starts** a rebuild or a check run (after the owner confirms) | T077: rebuild yes, check runs only proposed as commands (F-39) | owner decision |
| G13 | Rule export as Markdown sentence + table + CSV of all rules | `rules/*.dmn` + README index (T065/T078) | Markdown/CSV renderer (OV-5 asks about DMN) |
| G14 | UI words: finding / explanation, release, path, case, explored, checked, check run | Glossary has hypothesis, build epoch, journey | glossary entries (T101) |
| G15 | Same screen? page (P2) | `pnpm model:pairs` (CLI) | page |

## 3. Questions for the owner

1. G1 Overturn: confirm the semantics (a person's explanation wins, the rule is suppressed for that
   change, undo) and the designer's OV-1 (anyone may overturn).
2. G3 Release watch every 30 minutes: build it (a poller outside scans), or keep releases scan-only?
3. G7 Rule keys: show `H-nnnn`, or give confirmed rules a BR key (and the BA's BR records)?
4. G12 May the assistant start a check run after the owner confirms in the chat?
5. Order of work: the designer's P1 pages need G1, G2, G4–G6, G9, G10 behind them. Build the pages
   on today's read models first (Changes, Review tabs, Rules, Processes, Screens without "as of"),
   then the gaps, or the gaps first?
6. The designer's open questions OV-1…OV-5 (`12-v2-ux.md` § 12).

## 4. Owner answers (2026-10-21)

1. **G1 Overturn**: to discuss later. It is roadmap R-87, so the pages show no Overturn yet.
2. **G3**: no poller. Releases are known from scans only, and the release lanes show scan-time
   markers.
3. **G7**: the owner asked what the keys are; Claude explained them. Built on (b) until the owner
   says otherwise: a rule is `H-nnnn` while it is a hypothesis, and gets a `BR-` key once
   confirmed, the same key as the BA's business rule record for it.
4. **G12**: yes. The assistant starts a check run after the owner confirms in the chat, and the
   pages get a button for it (answer 12).
5. **Order**: pages first on today's read models, then the gaps.
6. **OV-1** any BA may overturn (for R-87). **OV-2** confirming an A/B test adds its cookie to
   Settings ▸ Hints. **OV-3** retired screens and their screenshots are kept forever. **OV-4**
   Decided is per portal. **OV-5** export DMN decision tables as well as Markdown and CSV.
