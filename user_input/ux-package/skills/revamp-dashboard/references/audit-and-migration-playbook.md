# Audit and migration playbook

A revamp carries risk a fresh build doesn't: there's an existing product, existing users, existing tests, and existing code that other things depend on. The visual work is usually the easy part; not breaking anything while doing it is the actual job.

## 1. Audit before touching anything

- **List the components that exist today** — a spreadsheet or markdown list is enough. Note whether each is used in one place or many; a component with 30 call sites needs a more careful migration than one with two.
- **Grep for hardcoded values.** Hex colors, raw px spacing, one-off font declarations outside any theme file. This reveals the real size of the token-migration work, which is almost always bigger than it first looks — old codebases accumulate "just this once" overrides.
- **Separate load-bearing from incidental.** A class name a test selects by, or that other code hooks into, is load-bearing. A class name that exists only because that's what the original author called it is safe to rename. Search the whole repo before renaming anything; when in doubt, ask.
- **Note the states you can't see by clicking around.** Error states, empty states, and edge-case data (very long strings, zero items) are the first things a revamp forgets, because they're the hardest to stumble onto. Find them in the code (conditionals, error boundaries, empty-array branches), not just on screen.

## 2. Decide what's changing and say so explicitly

By default, a revamp changes **how things look**, not **what they do**: same routes, same data, same keyboard shortcuts, same edge-case handling. If it genuinely needs to change behavior too, say so plainly up front and treat it as two changes happening at once — the person reviewing needs to know they're reviewing for both.

## 3. Land the token system before converting any component

1. **Add the new tokens/theme alongside the old styles** — old and new components should coexist on the same page during migration without visual chaos.
2. **Convert the most-reused primitives first** (buttons, inputs, text styles) — everything built on top gets partially updated for free.
3. **Verify each converted component in isolation** before moving to the next, in a sandbox if one exists or by finding every page it appears on.
4. **Keep the diff reviewable.** A single sweeping rewrite is nearly unreviewable and unrevertable. Prefer a sequence of smaller diffs — one component, one screen, one route at a time — even if that means the product looks visually inconsistent for a while behind a flag. Inconsistent-but-reviewable beats consistent-but-unauditable.

## 4. Screenshot, don't just eyeball

Capture the same viewport width and data state, before and after — including the empty state and at least one error state, since these are most likely to silently break (an empty-state illustration hardcoded to the old background color, a spinner invisible against the new surface color). If visual regression testing exists, read every diff, not just the pass/fail summary — an "expected, this was supposed to change" diff looks identical to a real regression in a summary view.

## Common traps specific to revamps

- **Contrast regressions on pairings nobody re-checked.** Great contrast on primary text/background, untested on a secondary-text-on-tinted-surface combination that "worked before."
- **Icon sets half-migrated.** Grep for every icon import, not just the ones on screens someone happened to visit.
- **Adjacent surfaces that don't get the memo.** Transactional emails, PDF exports, embedded widgets often render from a separate template a frontend revamp doesn't touch by default — flag these explicitly as in/out of scope.
- **Motion budget quietly exceeded.** Old animations get carried over unexamined because they "already worked," even when the new system's motion rules would rule them out. Audit existing animations against the new budget the same way you'd audit a new one.
