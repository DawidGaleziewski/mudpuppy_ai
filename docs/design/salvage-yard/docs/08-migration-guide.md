# 08 · Migration guide: from Console to Salvage Yard

How to move the live MudPuppy console (Console house style: JetBrains Mono, phosphor amber,
scanlines, bracket statuses) to Salvage Yard, and how to move the frontend skill your harness
uses. There are two tracks, and they should ship separately:

- **Track 1, re-skin.** Same pages, new tokens, fonts and components. Low risk, mostly mechanical.
- **Track 2, redesign.** New IA and new screens (chat first, drawer, processes workspace, review inbox). Product work, page by page.

Do Track 1 first. It makes Track 2 a set of template changes instead of a rewrite.

---

## 1. What changes, at a glance

| Area | Console today | Salvage Yard |
|---|---|---|
| Fonts | JetBrains Mono for everything | Archivo (UI, prose) · IBM Plex Mono (data) · Special Elite (people) |
| Headings and labels | Lower or sentence case, no tracking | Archivo Expanded caps, ≤4–5 words |
| Ground | `#0A0A08` + amber scanlines | `#111315` + 24px chalk grid (page only) |
| Identity colour | Amber `#FFB000` = brand **and** OK | Marker `#FF8F1F` = intent only; OK = inspected green |
| Accents | 3 neon accents reassigned per screen | No reassignable accents. Fixed meanings: coolant = active, blueprint = drawn |
| Error | `#FF3B30` | `#FF5A5F` (barn red `#C0392B` from the mission doc fails contrast) |
| Status | Bracket text `[ OK ]`, `[INT.]`, round live dot | Shape + word: ■ filled, □ hollow, ⌜⌟ dashed, ✕ cross; square pulse for running |
| Records | Plain links | Manila tags |
| Human notes | Same mono text | Typewriter on manila |
| Buttons | `[revoke]`-style bracket text links | Boxed buttons; links stay underlined text |
| Glow | Wordmark and big numbers | None |
| Wordmark | `mudpuppy://console` | `[MUD]PUPPY` paint block |
| Min text size | 10px | 11px |
| Nav | Top "Main" nav: Overview · Docs · Activity · Chat · Glossary | Portal picker + side nav: Home · Processes · Screens · Docs · Review · Scans · Settings |

## 2. Token map (Console → Salvage roles)

Full table: `migration/token-map.csv`.

| Console token | Old value | → Salvage role | New value | Note |
|---|---|---|---|---|
| `surface-0` | `#0A0A08` | `--sy-bg-ground` | `#111315` | + grid via `.sy-ground` |
| `surface-100` | `#131310` | `--sy-bg-plate` | `#181B1E` | |
| `surface-200` | `#1a1a14` | `--sy-bg-raised` | `#202428` | |
| — | — | `--sy-bg-well` | `#141618` | new: composer, plate footers, read-only fields |
| `border` | `#2b2a20` | **split** `--sy-border-weld` / `--sy-border-plate` / `--sy-border-control` | `#2C3136` / `#464D55` / `#6B737C` | Console's single border was 1.37:1; controls now meet 3:1 |
| `ink-100` | `#E8D9AE` | `--sy-text` | `#E8E4DA` | |
| `ink-500` | `#8a7f5c` | `--sy-text-muted` | `#A3A69F` | 4.97 → 7.55:1 |
| `brand` | `#FFB000` | **split** `--sy-intent` (brand, primary, needs you) + `--sy-ok` (OK) | `#FF8F1F` + `#7BC47F` | the biggest behavioural change |
| `kind-eval` | `#00E5FF` | `--sy-active` (running, live) | `#56C2E6` | |
| `kind-tool` | `#33FF66` | — (removed) | | categories use neutrals and labels |
| `kind-hook` | `#FF66C4` | — (removed) | | drafts now use `--sy-tobe` |
| `signal-error` | `#FF3B30` | `--sy-fail` | `#FF5A5F` | still failure only |
| `glow` | `rgba(255,176,0,.35)` | — (removed) | | |
| scanline texture | 3px amber lines | `--sy-grid-line` + `--sy-grid-size` | 24px grid | |
| `radius-none` / `radius-full` | 0 / 9999 | `--sy-radius` | 0 | no round dots any more |
| `space-1…7` | 4–28px | `--sy-space-1…7` | same | |
| `space-9` | 36px | `--sy-space-8` | 40px | nearest step |
| breakpoints | 639 / 640 / 1024 / 1280 | same numbers | | |

The rust palette in the "MudPuppy · mission and design rules" doc (`#14110D`, `#C9793A`, …) never shipped. Treat it as superseded by this table: rust brand → `--sy-intent`, accents 2–4 → removed, barn red → `--sy-fail`.

## 3. Type map

| Console style (JetBrains Mono) | → Salvage |
|---|---|
| display 20/700 (wordmark) | `.sy-wordmark` (22px header, 44px brand) |
| h1 18/700 | `.sy-h1` 26px Archivo Expanded caps |
| h2 15/700 | `.sy-h2` 18px (page sections) or `.sy-plate__title` 14px (panels) |
| body 13/400 | body 15px Archivo (prose); IDs, routes and timestamps stay mono via `.sy-mono` |
| body-sm 12 | 14px Archivo in rows and tables; `.sy-route` 12px mono for routes |
| label 11/500 lower case | `.sy-label` 12px caps (field labels, column heads) |
| caption 10 | 11px `.sy-legend`, `.sy-kbd` (nothing smaller) |

**Rule of thumb when converting a template:** if a person reads it as language, make it Archivo.
If it is an identifier someone could copy and paste, make it mono. If a person wrote it, make it `.sy-note`.

## 4. Status map

Full table: `migration/status-map.csv`. Map once, in the view layer (template filter or helper).

| Console | `data-status` | Shows |
|---|---|---|
| `[ OK ]` | `ok` | ■ OK |
| `[RUN.]` | `running` | ■ RUNNING (pulsing) |
| `[INT.]` | `stopped` | □ INTERRUPTED |
| `[SKIP]` | `skipped` | □ SKIPPED |
| `[FAIL]` | `failed` | ✕ FAILED |
| `[DRFT]` | `draft` | ⌜⌟ DRAFT (blueprint) |
| `[LIVE]` | `live` | ■ LIVE · {env} |
| `[ACTV]` (amendment active) | `live` | ■ ACTIVE |
| `[ .. ] connecting` | `queued` | ⌜⌟ CONNECTING |
| superseded amendment | `needs` | ■ RE-ANCHOR (in Review) |
| draft record to confirm | `draft` | ⌜⌟ DRAFT (counted in Review and Needs you) |
| not observable / gap | `unobserved` | ⌜⌟ NOT OBSERVED |
| rule candidate (inferred) | `inferred` | ⌜⌟ INFERRED |

## 5. Component map

Full table: `migration/component-map.csv`.

| Console component | → Salvage | What changes |
|---|---|---|
| Buttons & Form Controls | `.sy-btn` (`--primary`, `--strong`, `--quiet`, `--danger`), `.sy-field`, `.sy-input`, `.sy-select`, `.sy-textarea`, `.sy-check`, `.sy-seg` | `[action]` bracket links become boxed buttons; at most one primary per view; toggles become `.sy-seg` |
| Cards (stat / content / media) | `.sy-plate` + `__head/__body/__foot`, `.sy-rows` | big stats lose the glow; use `.sy-h2` + `.sy-num` |
| Carousel | dropped | use `.sy-grid` of `.sy-thumb` |
| Data Table | `.sy-table-wrap` > `.sy-table` | caps column heads; `th[scope=row]`; `[?]` becomes `.sy-hint` |
| Tabs & Dropdown | `.sy-tabs`/`.sy-tab`, native `.sy-select` | query-param tabs keep working: render `aria-current="page"` |
| Modal & Toast | `dialog.sy-dialog`, `.sy-toast` | revoke confirm becomes a real dialog |
| States (empty/loading/error) | `.sy-state`, `.sy-caret`, `.sy-state--failure` | same caret idea; inventory voice |
| Motion (pulse, bounce, caret) | pulse on the running square, caret | mark bounce dropped |
| Icon & Status Language | `.sy-status[data-status]` | brackets become shapes; the word stays |
| Nav Bar (top tabs) | `.sy-header` + `.sy-nav` | side nav, portal context, seven sections |
| Trace Row & Workflow Node | `.sy-row`, `.sy-steps`, step cards (`.sy-callout`, `.sy-drawn`) | |
| Project Card & Credit Row | portal overview: `.sy-plate` + `.sy-facts` | |
| Mark / MudPuppy Mark | `brand/logo/*` + live-text wordmark | recoloured pixel mark; tag icon favicon |
| Glossary `[?]` links | `.sy-hint` | 24px target |
| Live status dot (round) | removed | square shapes only |

## 6. IA map (old screens → new home)

| Old (SRS screen) | New place |
|---|---|
| SCR-001 Console header: Main nav, connection status, portal and data-store pickers, `[settings]` | `.sy-header` (portal picker, search, assistant status, Ask, ?) + `.sy-nav`; data store → nav footer and Settings ▸ Data store |
| SCR-002 Overview (portals and runs) | **Home** per portal; "All portals" in the picker shows the portal cards; the runs table moves to **Scans** |
| SCR-003/004/005 Documentation | **Docs** (restyle only); draft records to confirm also surface in **Review** |
| SCR-006 Server activity | **Scans ▸ Server activity** tab |
| SCR-007 Guided chat (workflow, credentials, process scope) | **Home** (assistant) + drawer on every page; workflow → Home "Where this portal is"; credentials → Settings vault + in-chat request; process scope → **Processes** |
| SCR-008 Glossary · SCR-009 BA wiki | "?" in the header + `[?]` hints (open item O-3) |
| SCR-010 State detail with amendments | **Screens ▸ screen detail** (`08-screen-detail.html`) |
| SCR-011 Amendments to review (superseded) | **Review ▸ re-anchor** |
| SCR-012 Portal settings | **Settings** (`11-settings.html`) |
| SCR-013 New portal | Portal picker "+ New portal" → Settings flow (restyle only) |
| SCR-014 Run detail | **Scans ▸ scan detail**: same tabs (States, Actions, Frontier, Forms, Network, Robots, Decisions, Trace, Process, Docs) as `.sy-tabs` (restyle only) |

Keep old URLs working: add redirects (for example `/chat` → `/portal/{p}/home`, `/amendments/superseded` → `/portal/{p}/review?type=reanchor`).

---

## 7. Plan

### Phase 0 · Prepare (½ day)
1. Copy `design-system/css`, `design-system/fonts` and `design-system/tag-icon.svg` into the console's static folder (for example `static/salvage/`). Keep the folder structure. Commit the whole package under `docs/design/salvage-yard/` as the reference.
2. Install the frontend skill (§9) so the harness works by the new rules from the first PR.
3. Run `migration/find-old-styles.sh <repo>` and save the counts as your burn-down baseline.
4. Capture "before" screenshots of every current page (Playwright) for comparison.

### Phase 1 · Foundation behind a flag (1 day)
1. Create a new base template (`base_salvage.html`) with the skeleton from any `screens/*.html`: CSS links, `body.sy-ground`, skip link, `.sy-app`.
2. Add a setting `UI_SALVAGE` (env var or per-route list). Migrated routes extend the new base; the others keep the old one. **Don't load both stylesheets on one page**: Console's global rules (mono everywhere, scanlines) would fight the new ones.
3. Add the view-layer helpers: `status_enum` / `status_word` filters (from `status-map.csv`), `tag(record)`, `note(text, by, at)`, `utc` (see `05-css-guide.md` §7).

### Phase 2 · Shell (1 day)
Header and side nav partials; portal picker as context; Ctrl K and Ctrl J; redirects. Ship with every page still at Console content but inside the new shell, behind the flag.

### Phase 3 · Re-skin page by page (Track 1)
Order by traffic: Overview/Home → Run detail → Docs → Settings → State detail → others. Per page:
1. Switch to `base_salvage.html`.
2. Replace bracket statuses with the `status` macro, IDs with `tag`, and human text with `note`.
3. Replace cards with `.sy-plate`, tables with `.sy-table`, and `[action]` links with `.sy-btn`.
4. Apply the type map (§3); remove inline colours.
5. Check: lint = 0, axe = 0 serious, compare screenshots at 1280 and 390.

### Phase 4 · Redesign (Track 2), screen by screen
For Processes, build from `10-processes.md`: data model and API (§9–10), then the scope migration (existing chat scopes → processes, FE-P12), then screens 04 → 05 → 06 → 07.

Value order: **Home + assistant drawer (01–03)** → **Review (09)** → **Settings and credentials (11)** → **Scans (10)** → **Processes (04–07)** → **Screen detail (08)** → **Map runs (12–16)**, which also needs crawler work (checkpoints and replay, same-URL step detection, probing), so start that backend early. Each screen in `screens/` is the target; the requirements are in `07-requirements.md`. Processes needs backend work (variants, revisions, change spec), so start the API in parallel.

### Phase 5 · Clean up
Remove the Console stylesheet, JetBrains Mono, scanlines and glow, and the old base template. Run `find-old-styles.sh` and expect 0. Remove the flag.

### Rollback
Until Phase 5 the flag switches any route back to Console instantly. Keep the old base template until two releases after the last route moves.

## 8. Tips for re-implementing

- **Convert by meaning, not by colour.** For every amber thing in Console, ask whether it is brand or a primary action (marker), whether it means "OK" (inspected), or whether it is decoration (remove it). This is where most mistakes happen.
- **Bracket buttons were links.** `[revoke]`, `[settings]` and `[more]` become `.sy-btn` when they change something and stay underlined links when they navigate.
- **Glossary `[?]`** becomes `.sy-hint`. Keep the anchors so existing glossary links still work.
- **Count and ID handling:** wrap IDs at the data layer (the record object knows its URL), not with regex in templates.
- **Fixtures:** use the reference-insurer and wikipedia data in the screens as e2e fixtures. The screenshots are your visual baselines.
- **Polish text:** don't uppercase long Polish names (`.sy-case-normal` on titles longer than about five words).
- **Server rendering stays.** The library needs no client framework. Add JS only for the drawer, tabs, dialog and keyboard shortcuts (`05-css-guide.md` §8).
- **Don't port Console's reassignable accents.** If a screen needs categories, use neutrals and labels (`03-colour-guide.md` §4.8).
- **Watch double-loading:** a page that still includes Console's CSS will look "almost right" but wrong (mono labels, scanlines). Lint for the old stylesheet's link tag.

---

## 9. Migrating the frontend skill (harness)

**Today** the harness builds UI from the **Console** design system (the `Console` Design System
artifact: its README rules, `tokens.json` and components, plus any repo `CLAUDE.md` or skill that
points at it). Those rules now conflict with Salvage on every point that matters: mono only, amber
for OK, round means alive, bracket statuses, scanlines and glow.

**New skill:** `skill/mudpuppy-salvage-ui/` (SKILL.md + references).

Steps:
1. **Install.** Copy `skill/mudpuppy-salvage-ui/` to `<repo>/.claude/skills/mudpuppy-salvage-ui/` (it carries its own `references/` and `scripts/find-old-styles.sh`). Commit this whole package to the repo (for example `docs/design/salvage-yard/`) so the reference screens are available. Set the two paths at the top of SKILL.md: `DS_PATH` (runtime CSS and fonts, default `static/salvage`) and `DESIGN_PKG` (the committed package).
2. **Retire the old one.** If the repo has a Console or design-system UI skill, delete it, or change its description to `DEPRECATED: use mudpuppy-salvage-ui for all MudPuppy UI` and empty its body, so two skills don't compete for the same trigger.
3. **Point the harness at it.** In `CLAUDE.md` or `AGENTS.md` add: *"All UI work in this repo uses the mudpuppy-salvage-ui skill. Never use Console tokens (amber `#FFB000`, JetBrains Mono, scanlines, bracket statuses)."* (The `AGENTS.md` in this package is a ready-to-merge version.)
4. **Add the guards.** stylelint rules (`05-css-guide.md` §4) and `find-old-styles.sh` in CI, so drift fails the build, not the review.
5. **Smoke test.** Ask the harness to "build the Review inbox empty state". The result must use `.sy-state`, the inventory voice and no hex. Then ask it to "add a status for a skipped scan". It must use `data-status="skipped"`, not `[SKIP]`.
6. **Optional, design tools.** `design-system/tokens/tokens.json` is in the same list format as the Console Design System artifact, so it can seed a new "Salvage Yard" design system for decks and designs. Keep the Console artifact as an archive; don't edit it into Salvage.

What changed in the skill's rules:

| Console skill said | Salvage skill says |
|---|---|
| One typeface, JetBrains Mono everywhere | Three voices: Archivo, IBM Plex Mono, Special Elite (people only) |
| Square by default; round means alive | Square always; running is a pulsing square |
| One identity colour, two jobs (brand + OK) | One paint, one job: marker = intent, inspected = OK |
| Four accents, reassigned per screen | Fixed meanings; no reassignable accents |
| Red means only failure | Same (new value `#FF5A5F`) |
| Bracket status text | `.sy-status[data-status]` shape + word |
| Scanlines and glow | Yard grid; no glow |
| Labels in lower case | Labels in expanded caps (≤ 4–5 words) |
| 10px floor | 11px floor |

## 10. Risks

| Risk | Mitigation |
|---|---|
| Amber "OK" habit: devs paint success orange | status-map helper + stylelint + review checklist item |
| Both stylesheets on one page | per-route base template; lint for the old `<link>` |
| Uppercased long Polish names | `.sy-case-normal`; review checklist |
| Fonts blocked by CSP | `font-src 'self'`; fonts are local |
| Redesign scope creep (Processes backend) | Track 1 first; Processes behind its own flag |
| Product rule "As-is only" conflicts with the to-be workspace | resolve open item O-1 before building Processes 05–07 |
