# Console — bundled default design system

A complete, self-contained dark-terminal dashboard design system, embedded here so this skill works in any environment — including ones that can't fetch a live claude.ai artifact link. Apply this by default (see SKILL.md, Step 0) only when no other design system is supplied for the task. It was built as the shared house style for a set of internal IT dashboards; the first product built on it (an agent-trace observability tool called felix telemetry) is referenced below purely as a worked example — don't carry its specific name, mark, or entity types (traces/spans/agents) into an unrelated dashboard.

## The five rules

1. **One typeface, always.** JetBrains Mono, everywhere, headlines included. No second "UI" font.
2. **Square by default; round means "alive."** Every row, card, chip, and panel is a hard rectangle (0 border-radius). The *only* rounded shape in the whole system is a small live-status dot. If a design calls for rounding something else, that's a signal to reconsider, not a style choice to make freely.
3. **One identity color, two jobs.** The primary accent should be both the product's identity color and its "Ok"/nominal status color — earning its place with a real second job, not just decorating. Console's own choice is amber (`#FFB000`); a different product on this system can pick a different identity color, but should keep the "does two real jobs" discipline.
4. **A small set of extra accent hues, reassigned per screen.** Console has exactly three more accents beyond the identity color (green, cyan, magenta). They mean different things on different screens — e.g. a category on one screen, an actor/identity on another — never two meanings on the same screen. Before adding a fifth hue to extend this system, check whether an existing one can be reassigned instead.
5. **One color is permanently reserved.** Red (`#FF3B30`) means failure and nothing else — never a category color, never decorative. Every system needs at least one color a user's danger instinct can always trust.

## Color tokens

| Token | Value | Usage |
|---|---|---|
| `surface-0` | `#0A0A08` | Page background — near-black, warm undertone, not blue |
| `surface-100` | `#131310` | Row / card / panel background |
| `surface-200` | `#1a1a14` | Hover background |
| `border` | `#2b2a20` | Hairline border — solid = ready/settled, dashed = pending/waiting |
| `ink-100` | `#E8D9AE` | Primary text — warm cream, never pure white |
| `ink-500` | `#8a7f5c` | Secondary/meta text, muted icons, "skipped"-type states |
| `brand` | `#FFB000` | Identity color + "Ok"/nominal status (rule 3) |
| `accent-2` | `#33FF66` | First extra accent (rule 4) — green |
| `accent-3` | `#00E5FF` | Second extra accent (rule 4) — cyan; doubles as "Running/in-progress" status |
| `accent-4` | `#FF66C4` | Third extra accent (rule 4) — magenta |
| `signal-error` | `#FF3B30` | Error status only (rule 5) |
| `glow` | `rgba(255,176,0,0.35)` | Phosphor text-shadow, wordmark and headline numbers only — never on borders, icons, or body text |

If a different identity color fits the new product better than amber, swap `brand` (and optionally `accent-2/3/4`) but keep every other token, the role structure, and all five rules unchanged.

## Type

JetBrains Mono only (`ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace` as fallback stack). Sizes: `display` 20px/700 (wordmark only), `h1` 18px/700 (page titles), `h2` 15px/700 (section/card titles), `body` 13px/400 (default row/card text), `body-sm` 12px/400 (secondary values), `label` 11px/500 (column headers, tab labels — sentence case, never tracked-out caps), `caption` 10px/400 (legends, footnotes).

## Spacing

4px-rooted scale: 4, 8, 12, 16, 20, 24, 28, 36px. Real layouts mostly land on 12/16/24/28px. Card/row padding: 16px. Page padding: 28px (top/sides), 36px (wide desktop left/right).

## Radius

Binary only: `0px` (everything) or `9999px` (the one live-status dot, nothing else — rule 2).

## Breakpoints

`mobile-max` 639px, `tablet-min` 640px, `desktop-min` 1024px, reference design width 1280px.

- **Desktop ≥1024px**: full layout as designed — multi-column grids, a detail panel sitting beside its parent list.
- **Tablet 640–1023px**: grids drop to 2 columns; a side-by-side detail panel moves below its parent, full-width, same content and tab order, just stacked.
- **Mobile <640px**: grids go to 1 column; dense multi-column rows collapse to stacked cards (primary content + status on line one, meta wrapping on line two); a row-plus-side-panel becomes a full-screen push-in on tap; nav collapses to icon-only or a bottom bar. Always ≥44×44px touch targets; never shrink text below `caption` (10px) to fit content.

## Motion — exactly three sanctioned animations, nothing else

1. **Live-status pulse**: `1.3s ease-in-out infinite` opacity pulse (1 → 0.35 → 1) on a small round status dot for a genuinely in-flight item, and *only* the dot — never the row/card/icon around it. Falls back to a solid dot under `prefers-reduced-motion`.
2. **Mark bounce**: a single, non-repeating bounce of the product's logo mark on first paint of the app shell. Never re-triggers on navigation.
3. **Loading caret blink**: `1s step-end infinite` hard on/off (no easing) — a text caret standing in for a spinner, used only in a Loading state. Falls back to static `loading…` text under `prefers-reduced-motion`.

## Effects

One phosphor text-shadow glow (`0 0 8px` in the identity color at ~35% opacity), applied only to the wordmark and large headline numbers. One static (never animated) scanline texture behind full-page screens — a `repeating-linear-gradient` at ~4% opacity, 3px pitch, tinted to the identity color.

## Component rules (condensed)

- **Buttons**: primary (solid identity-color fill) is the one call-to-action per view, not a default for anything that feels important. Danger variant (outlined in `signal-error`) only for genuinely destructive actions. Disabled = 35% opacity, `not-allowed` cursor, no separate "disabled gray." Focus ring: 2px solid identity color, 1px offset, on every focusable element without exception.
- **Inputs/selects**: sit on `surface-100` with a `border` outline — never a "lighter floating" surface distinct from cards/rows.
- **Cards**: three general shapes — stat card (label → big glowing number → colored delta), content card (icon + title + 1–2 lines body + one footer action, divided by a border rule), media card (fixed-height preview block + title/meta below).
- **Carousel**: pagination indicators are short rectangular ticks, **not dots** — round is reserved for the live-status signal (rule 2), and a carousel position isn't one.
- **Data table**: sort indicator uses color *and* a directional glyph, never color alone; row hover matches every other hoverable row (`surface-100` → `surface-200`).
- **Tabs (in-page)**: underline style — active gets identity-color text + 2px underline, inactive is muted with no underline. Deliberately different from a page-level nav bar's solid-fill active tab, so real top-level navigation stays visually unambiguous from in-page tabs.
- **Nav bar (page-level)**: active destination gets a solid identity-color fill (the *only* place a text label sits on a solid identity-color background); inactive destinations are muted with a hover background only.
- **Dropdown**: trigger matches the native-select styling exactly; menu sits flush beneath it, no gap, no radius; selected item marked by identity-color text alone (no checkmark needed in a single-select list).
- **Modal**: `surface-100` panel with an identity-color border (the one place that border color doesn't mean "success") over a dark scrim; destructive actions use the danger button, dismiss is always a secondary button, never deprioritized to ghost.
- **Toast**: bottom-right, `surface-100` + `border`, a 3px left accent in the relevant status color (not a full tint) — status accent only, not a new vocabulary.
- **Empty/Loading/Error states**: dashed border throughout (matching "pending" elsewhere). Empty = muted icon + direct headline + one context line, no mascot/illustration. Loading = the caret blink (motion rule 3), not a spinner. Error = `signal-error`-tinted border/icon/headline, a specific reason in muted text, a bracket-style retry action in the identity color.
- **Status language**: bracket-style text (`[ OK ]`, `[FAIL]`, `[SKIP]`, `[RUN.]`) rather than pill/badge shapes, set in the same monospace body size as surrounding data so it reads as data, not chrome bolted on top.

## Worked example: how one product used this system

felix telemetry (an agent-trace observability tool) is the reference implementation this system was built for. It kept every rule and token above unchanged, and added only: its own name/wordmark (`felix://telemetry`), its own logo mark (a bird built from small nodes and connecting lines — literally the same visual unit its own workflow-graph screen uses to draw real data, which is why that mark and not a generic one), and its own entity vocabulary (traces, spans, hooks/tasks/evals as the four "kind" categories mapped onto `accent-2/3/4` + `brand`). None of that entity vocabulary should carry into an unrelated dashboard — a new product goes through the same three additions (name, mark, entity-to-accent mapping) with its own answers.
