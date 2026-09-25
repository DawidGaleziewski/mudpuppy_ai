# Scorecard: Dashboard UI (T026)

Scored 2026-09-26 against `.claude/skills/revamp-dashboard/references/good-practices-scorecard.md`,
on `data/db/production.sqlite` (liveinsurer, 9 runs) plus an empty and a missing store. Screenshots in
[`screenshots/`](screenshots/) at 375, 768 and 1280px, taken with headless Chromium (the crawler's
Playwright). Not a revamp, so migration safety does not apply.

| Category | Score | Evidence | Gaps |
| --- | --- | --- | --- |
| Token fidelity | **Pass** | Every value in `app.css` is `var(--…)`; `tests/test_tokens.py` fails on hex/rgb literals, free radii, undefined vars, or a Console colour that drifts. Pathfinder aliases (`--status-running`, `--safety-risky`, …) name intent at the call site. | Media queries use literal widths (CSS cannot read custom properties there); they mirror `--bp-tablet`/`--bp-desktop` and are commented. |
| Component states | **Pass** | Designed empty (`empty-1280.png`, "No states observed" in `run-stopped-1280.png`), filtered-empty, error (`store-missing-768.png`), not-found (`not-found-375.png`), loading (caret on in-flight filter/pager requests), hover, focus (2px brand ring on every focusable element), disabled (35 % opacity rule). Route tests assert each state's text. | There is no first-load loading state because pages are server-rendered (documented in `pathfinder-console.md`). |
| Accessibility | **Partial** | Semantic HTML (tables with captions and scoped headers, `nav` + `aria-current`, labelled selects, skip link, `role="status"` for live state and banner). Status and confidence are always text (`[STOP] stopped warning`, `inferred`), never colour alone. Everything is a link, button or select, so the keyboard reaches all of it. Contrast below. | `ink-500` on `surface-200` is **4.39:1**, under AA 4.5:1 for small text. It only happens on a hovered table row, where muted text sits on the hover background. The values are Console tokens; changing them is a design-system decision (open question 1). Accepted as-is by the user (2026-09-26). |
| Responsive | **Pass** | 1280: full tables; 768: stats in 2 columns, facts in 2 columns, table rows become stacked cards like on mobile (user decision 2026-09-26; `run-frontier-768.png`); 375: stat cards stack, table rows become stacked cards with inline labels, tabs scroll horizontally, top bar wraps (`overview-375.png`, `run-actions-375.png`). `scrollWidth` equals the viewport at every width (no page-level horizontal scroll). Selects, tabs, nav and buttons are ≥ 44px tall. | Inline links inside table cells (run ids) are text-height, not 44px. |
| Motion discipline | **Pass** | Exactly the three sanctioned animations (`tests/test_tokens.py` asserts the keyframe set): live-dot pulse on `[RUN.]` only, one mark bounce on first paint, caret blink while loading. htmx's injected 200ms indicator fade is disabled (`includeIndicatorCSS: false`). `prefers-reduced-motion` gives a solid dot, no bounce and a static "…". Live refreshes swap without flashing. | — |
| Performance | **Pass** | JetBrains Mono self-hosted, subset latin + latin-ext, 3 weights (~88 KB total), `font-display: swap`, the regular weight preloaded. htmx + hx-sse ~43 KB, vendored, cached for 1h; scripts `defer`. No images. Every page renders in < 50 ms on a 10 000-item run (`tests/test_perf.py`, limit 1 s). | — |

## Contrast of every token pairing used (WCAG 2.x)

| Foreground | Background | Ratio | AA (4.5 small text) |
| --- | --- | --- | --- |
| `ink-100` | `surface-0` / `-100` / `-200` | 14.12 / 13.27 / 12.45 | pass |
| `ink-500` | `surface-0` / `-100` | 4.97 / 4.67 | pass |
| `ink-500` | `surface-200` (hovered row) | **4.39** | **fail** |
| `brand` | `surface-0` / `-100` / `-200` | 10.82 / 10.16 / 9.54 | pass |
| `surface-0` | `brand` (active nav) | 10.82 | pass |
| `accent-2` (read) | `surface-100` | 13.86 | pass |
| `accent-3` (running) | `surface-100` | 12.10 | pass |
| `accent-4` (mutating, inferred) | `surface-0` / `-100` | 7.50 / 7.05 | pass |
| `signal-error` | `surface-100` / `-200` | 5.25 / 4.93 | pass |
| `border` | `surface-100` | 1.29 | n/a (decorative; every bordered meaning also has text) |
