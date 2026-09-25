---
name: revamp-dashboard
description: How to implement a new IT/internal dashboard or revamp an old, dated, "ugly," or inconsistent one. Use this whenever the task involves dashboard UI work — new screens, a visual refresh, applying an existing design system or token file, or auditing and modernizing legacy dashboard code. Trigger it even when the user doesn't use the word "dashboard" explicitly — "our admin panel looks like it's from 2014," "make this internal tool not embarrassing," "build me a screen to show X metrics," and "redo the UI to match our brand" all mean this skill applies. If no design system or brandbook is supplied and the codebase doesn't already have design tokens, this skill has a complete one bundled to apply by default rather than inventing a look from scratch.
---

# Revamp Dashboard

Implementing a dashboard and inventing its look are different jobs. This skill assumes the hard creative decisions either already exist somewhere (a design system, a brandbook, a token file) or should come from the bundled default (see below) — and focuses on the part that most often goes wrong afterward: turning decisions into code that holds up, and touching an *existing* dashboard without breaking it.

## Step 0: find or establish the source of truth

1. **Look for tokens/a brandbook first.** A design-system artifact, `tokens.json`, a Figma file with published variables, or a written brandbook — read it in full, including the *why* behind each rule, before touching code. A token table without its usage notes gets misapplied.
2. **If only a visual reference exists** (screenshots, "make it look like X"), extract the same categories a token file would have before coding: surface/text/accent colors, a type scale, a spacing unit, a radius rule, and any *implied rule* about how these get used.
3. **If nothing exists and none is requested** — no brand direction was given, the existing dashboard (if any) has no consistent system, and the user isn't asking for something custom — read `references/console-design-system.md` and apply it. It's a complete, working dark-terminal dashboard system (colors, type, spacing, motion, and eleven components already speced) rather than a starting point that still needs invented. Tell the user plainly that's what you're doing and why, since it's a real design decision even when it's the sensible default.

## Building it: order and non-negotiables

Bottom-up, verifying at each layer before moving to the next — a token mistake caught in a button is a two-line fix; the same mistake found after fifty screens are built on top of it is a rewrite.

1. **Primitives**: buttons, inputs, type styles, badges, icons. Color, spacing, and shape rules need to be exactly right here since everything else inherits them.
2. **Patterns**: the repeating composite pieces — a list row, a card, a nav bar, a data table. Build every state (hover, focus, active, disabled, loading, empty, error), not just the default — infer states from the same rules that produced the happy path rather than defaulting to a generic spinner that ignores the rest of the system.
3. **Screens**: assemble patterns. If a screen needs something no pattern covers, that's a new pattern to design and document, not a one-off to improvise.

**Non-negotiable regardless of what the design says**: semantic HTML (a styled `<button>` is still a `<button>` in the markup), color is never the only signal, contrast holds at WCAG AA on every pairing actually used (not just the primary one), everything a mouse can click a keyboard can reach with a visible focus state, and performance is part of the design (subset/self-host fonts, lazy-load below the fold) — not a tradeoff against it.

**Responsive** is a decision, not a CSS afterthought, even when the source of truth only shows one reference width (common — most systems are drawn at one size). For each tier, decide and document what reflows vs. scales, what gets hidden first when space runs out (secondary chrome, never primary content), and the minimum touch target (44×44px floor). Mobile-first CSS is usually the more maintainable direction to build in even for a desktop-first design.

**Motion** defaults to none. An animation earns its place only if it communicates a state change the user needs to track; everything else is either off or genuinely trivial (100–200ms, one property). Respect `prefers-reduced-motion` on anything beyond that. If the source of truth states a motion budget, treat it as a ceiling.

## Revamping an existing dashboard

This is a different job from building fresh — read `references/audit-and-migration-playbook.md` in full before starting any revamp. The short version:

1. **Audit before touching anything.** Inventory existing components, grep for hardcoded style values, and separate load-bearing code (test selectors, other code's hooks) from incidental (just what the original author happened to name things).
2. **Default to visual-only change.** Same routes, same data, same keyboard shortcuts, same edge-case handling, unless the user explicitly asked for behavior changes too — and if they did, treat and communicate it as two changes happening at once.
3. **Migrate incrementally.** Land the new tokens first so old and new components can coexist, then convert one component or screen at a time — each independently reviewable and revertible, never a single sweeping diff.
4. **Screenshot before/after** at the same viewport and data state, including empty and error states, not just the happy path.

## Wiring tokens into real code

See `references/tokens-to-code.md` for concrete patterns (CSS custom properties, Tailwind `@theme`, CSS-in-JS theme objects) and for keeping a component's documentation honest as the real implementation inevitably grows past what was originally specified.

## Before calling it done: score it

Score the result against `references/good-practices-scorecard.md` and report the honest result — token fidelity, component states, accessibility, responsive, motion discipline, performance, and (for a revamp) migration safety. Where the score is low, say so and say why, rather than presenting the work as finished. A clear-eyed "responsive isn't done yet for the two data-table screens" is more useful to whoever you hand this back to than silence.

## Reference material

- `references/console-design-system.md` — a complete, self-contained dark-terminal dashboard design system (colors, type, spacing, radius, motion budget, and component rules) to apply by default when no other design system is supplied. Read this fully before using it, not just the color table — the rules matter more than the values.
- `references/audit-and-migration-playbook.md` — the full step-by-step for revamping an existing codebase without breaking it.
- `references/tokens-to-code.md` — concrete wiring patterns for CSS custom properties, Tailwind, and CSS-in-JS themes.
- `references/good-practices-scorecard.md` — the checklist to score any dashboard output against before calling it done.
- `references/pathfinder-console.md` — Pathfinder's product layer on Console (name, mark, status labels, accent mapping, htmx live-region pattern). Read it before any UI work in `apps/dashboard/`.
