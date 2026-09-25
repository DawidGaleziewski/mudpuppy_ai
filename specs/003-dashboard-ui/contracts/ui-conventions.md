# Contract: UI conventions (product layer on the Console design system)

The Console design system (`.claude/skills/revamp-dashboard/references/console-design-system.md`)
applies unchanged: tokens, five rules, type, spacing, radius, breakpoints, three animations. This
file holds only what Console asks each product to decide for itself (name, mark, entity-to-accent
mapping) plus the status vocabulary for Pathfinder's records. It is mirrored in
`.claude/skills/revamp-dashboard/references/pathfinder-console.md`; that copy is the one agents load.

## Identity

- Name / wordmark: `pathfinder://console`, `display` size, glow.
- Mark: three small square nodes joined by two hairlines in a bent path (the same node/edge unit
  the state graph will use later), identity colour; one bounce on first paint of the shell only.
- Identity colour: `brand` amber `#FFB000`, which also means "Ok / nominal" (rule 3).

## Status language (bracket text, body size, never a pill)

| Record | Value | Label | Colour token | Extra signal |
| --- | --- | --- | --- | --- |
| run | `completed` | `[ OK ]` | `brand` | — |
| run | `running` | `[RUN.]` | `accent-3` | live dot (pulse), the only animated element |
| run | `stopped_warning` | `[STOP]` | `signal-error` | warning text shown beside it |
| run | `interrupted` | `[INT.]` | `ink-500` | — |
| frontier | `done` | `[DONE]` | `brand` | |
| frontier | `pending` | `[PEND]` | `ink-500` | dashed row border (pending = dashed) |
| frontier | `skipped_unsafe`, `denylisted`, `robots_disallowed`, `out_of_scope`, `budget_reached` | `[SKIP]` + status text | `ink-500` | reason column |
| frontier | `unreachable` | `[FAIL]` | `signal-error` | reason column |
| edge | `executed` / `skipped` | `[ OK ]` / `[SKIP]` | `brand` / `ink-500` | |
| decision | `warning` | `[WARN]` | `signal-error` | |
| decision | `skip`, `refuse` | `[SKIP]`, `[RFSE]` | `ink-500` | rule column |
| decision | `merge`, `split`, `note` | `[MRGE]`, `[SPLT]`, `[NOTE]` | `ink-100` | |

Red (`signal-error`) is used only where the crawl failed or stopped (rule 5); a safety skip is the
system working, so it is muted, not red.

## Accent mapping on this product (rule 4: one meaning per screen)

- **Run detail, actions section**: safety class. `read` → `accent-2` green, `mutating` →
  `accent-4` magenta, `destructive` and `external-side-effect` → `accent-4` magenta with the class
  name in text (never colour alone; red stays reserved).
- **Everywhere, confidence**: `observed` → `ink-100` plain; `inferred` → `accent-4` + text
  `inferred`; `needs_confirmation` → `accent-4` + text `needs confirmation` + dashed border. The
  text is the signal; colour is secondary (FR-005).
- **Overview**: accents are not used for categories; portal cards are neutral.

## Components used and their states

Nav bar (page level, environment switch as a dropdown), stat card (label → big glowing number),
data table (sortable columns carry glyph + colour), in-page tabs for run detail sections, filter
selects, pagination ticks (rectangular), empty / loading (caret blink) / error / not-found states
with dashed borders, and a toast-style banner for "live connection lost — view may be stale".

## Live regions

- Every region that shows store data is a live region (contracts/http-routes.md).
- While a region re-fetches, it keeps its current content; no spinner or flash (motion budget).
- Tablet and mobile (<1024px, user decision 2026-09-26): tables collapse to stacked cards (status + primary text on line one, meta on
  line two); run detail tabs scroll horizontally; touch targets ≥44px.
