# 05 · CSS guide: how the styles are built and how to use them

Everything is plain CSS. There is no build step, framework or runtime. It works in the
console's server-rendered templates today and in any component framework later.

## 1. Files

| File | Size | What |
|---|---|---|
| `design-system/css/tokens.css` | 7 KB | Custom properties: raw palette + **roles** + type, space, sizes, motion, z-index |
| `design-system/css/fonts.css` | 2 KB | `@font-face` for the self-hosted WOFF2 files |
| `design-system/css/salvage.css` | 47 KB (9.5 KB gzip) | Reset, base, layout, ~178 component classes, utilities, motion, responsive, forced-colours |
| `design-system/fonts/*.woff2` | 250 KB | Archivo (variable wght 100–900 × wdth 62–125), IBM Plex Mono 400/500/600, Special Elite 400 + licences |
| `design-system/tokens/tokens.json` | | Generated from `tokens.css`: raw paint + role tokens (as aliases), type styles, space, sizes, radius, borders, durations, z-index, breakpoints, in the Console design-system list format with a usage note on every token |
| `design-system/tokens/tokens.dtcg.json` | | Generated from `tokens.css` in W3C DTCG format; token `sy.<name>` = CSS `--sy-<name>`, so a kebab-case name transform reproduces the CSS names |

**Load order matters:** `tokens.css` → `fonts.css` → `salvage.css` → your app CSS.

```html
<link rel="preload" href="/static/salvage/fonts/Archivo-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/static/salvage/css/tokens.css">
<link rel="stylesheet" href="/static/salvage/css/fonts.css">
<link rel="stylesheet" href="/static/salvage/css/salvage.css">
<link rel="stylesheet" href="/static/app.css">   <!-- product-specific, see §4 -->
```

Keep the folder structure `css/` next to `fonts/`, because `fonts.css` uses `../fonts/…`. Serve `design-system/tag-icon.svg` as the favicon.
CSP: `font-src 'self'; style-src 'self'`. No third-party hosts are needed.

## 2. Architecture

### Cascade layers
```css
@layer sy.reset, sy.base, sy.layout, sy.components, sy.utilities;
```
Everything in `salvage.css` lives in these layers, except `@keyframes`, the
`prefers-reduced-motion` stop and the media queries.
**Unlayered CSS beats every layer.** Put product CSS in its own later layer so a single
class can still override a component on purpose without `!important`:

```css
@layer sy.reset, sy.base, sy.layout, sy.components, sy.utilities, app;
@layer app { .mp-scan-map { display: grid; grid-template-columns: repeat(4, 1fr); } }
```

### Naming
- Library: `.sy-block`, `.sy-block__element`, `.sy-block--modifier`. Private custom properties start with `--_`.
- Product code must **not** invent `sy-` classes. Use your own prefix (suggested `mp-`) for screen-specific layout.
- No `.is-active`, `.selected` or `.open`. State is ARIA (§3).

### Tokens: roles, not paint
`tokens.css` has two layers. Components and product code use **roles only**:

| Use this | Not this |
|---|---|
| `var(--sy-intent)` | `var(--sy-marker)`, `#FF8F1F` |
| `var(--sy-bg-plate)` | `var(--sy-steel-800)` |
| `var(--sy-text-muted)` | `var(--sy-ash)` |

To retune the palette, change the raw value or re-point a role in `tokens.css`. To add a meaning, add a **role**. Read `03-colour-guide.md` §4 first, because the answer is usually "reuse an existing one".

## 3. State is ARIA

| State | Attribute | Styled on |
|---|---|---|
| Current page / section | `aria-current="page"` | `.sy-nav__item`, `.sy-tab` |
| Current step | `aria-current="step"` | `.sy-steps > li`, `.sy-row` |
| Selected item (list, card, drawn step) | `aria-selected="true"` or `aria-current="true"` | `.sy-row`, `.sy-plate`, `.sy-callout`, `.sy-drawn`, `tr` |
| Toggle on | `aria-pressed="true"` | `.sy-seg > button` |
| Tab selected | `aria-selected="true"` | `.sy-tab` |
| Invalid | `aria-invalid="true"` | `.sy-input`, `.sy-select`, `.sy-textarea` |
| Busy | `aria-busy="true"` | `.sy-btn` (adds caret) |
| Disabled | `disabled` / `aria-disabled="true"` | `.sy-btn` |
| Hidden | `hidden` | everything (`display: none !important`) |
| Expanded | native `<details open>` | `.sy-disclosure` |

### Enums: `data-status`
The backend's status values map to one `data-status`. The console's current vocabulary maps like this
(full table: `migration/status-map.csv`):

| Console today | `data-status` | Word to show |
|---|---|---|
| `[ OK ]` | `ok` | OK |
| `[RUN.]` | `running` | Running |
| `[INT.]` | `stopped` | Interrupted |
| `[SKIP]` | `skipped` | Skipped |
| `[FAIL]` | `failed` | Failed |
| `[DRFT]` | `draft` | Draft |
| `[LIVE]` | `live` | Live · {environment} |
| (new) needs a person | `needs` | Needs you |
| (new) not observed | `unobserved` | Not observed |
| (new) inferred | `inferred` | Inferred |
| (new) queued | `queued` | Queued |
| (new) to do | `todo` | To do |

Put the mapping in **one** place in the backend or view layer, for example a template filter. Never map in templates ad hoc.

## 4. What you may write in markup and app CSS

**Allowed inline styles:** layout only (`display`, `flex*`, `grid*`, `gap`, `width`/`min-`/`max-width`,
`margin`, `align-*`, `justify-*`, image `height`) and the hooks `--sy-gap`, `--sy-min` (for `.sy-grid`) and `--value` (for `.sy-meter`).
Graph and timeline layout are the exceptions: `.sy-node`, `.sy-node-group` and `.sy-graph__canvas` take `left`, `top`, `width`, `height` and `--sy-node-w` from the server's layout, and `path.sy-edge` takes its `d`; `.sy-releases__span`, `__scan` and `__range` take `left`/`width` in %, `.sy-releases` takes `--sy-releases-name`.

**Forbidden everywhere outside `tokens.css`:**
- hex, `rgb()` or named colours (use roles)
- `font-family`, `font-size` or `letter-spacing` overrides (use the type classes)
- `border-radius` other than 0, `box-shadow`, gradients over data, `opacity` for "disabled"
- `!important` (except the library's `[hidden]` and reduced-motion rules)
- new animations
- `text-transform: uppercase` on long text (more than five words)

**Suggested stylelint rules** (`.stylelintrc.json` for app CSS):
```json
{
  "rules": {
    "color-no-hex": true,
    "color-named": "never",
    "function-disallowed-list": ["rgb", "rgba", "hsl", "hsla"],
    "declaration-property-value-disallowed-list": {
      "border-radius": ["/^(?!0|var\\(--sy-radius\\)).*/"],
      "box-shadow": ["/^(?!none$).*/"]
    },
    "property-disallowed-list": ["font-family", "font-size", "letter-spacing", "text-transform", "animation", "transition"],
    "declaration-no-important": true,
    "selector-class-pattern": "^(mp|sy)-[a-z0-9]+(?:-[a-z0-9]+)*(?:__[a-z0-9-]+)?(?:--[a-z0-9-]+)?$"
  }
}
```
`migration/find-old-styles.sh` greps the codebase for Console-era tokens, classes and inline colours.

## 5. Layout utilities

```html
<div class="sy-stack" style="--sy-gap: 12px">…</div>      <!-- vertical stack -->
<div class="sy-cluster">…</div>                            <!-- wrapping row -->
<div class="sy-split">…</div>                              <!-- space-between row -->
<div class="sy-grid" style="--sy-min: 280px">…</div>       <!-- responsive auto-fit grid -->
<div class="sy-columns"><div class="sy-col-main">…</div><div class="sy-col-side">…</div></div>
```
`.sy-col-side` is itself a flex column with a 16px gap: put plates directly in it.

## 6. Responsive

Custom properties can't be used inside `@media`, so mirror these numbers:
`max-width: 1023px` (tablet: nav strip, drawer stacks) · `max-width: 639px` (mobile: one column) ·
`pointer: coarse` (dense buttons grow to 44px). Validate at **1280** first (the reference), then 390.

## 7. Using it from templates

**Jinja / server templates (today's console):**
```jinja
{% macro status(value, word=None) -%}
  <span class="sy-status" data-status="{{ value|status_enum }}">{{ word or (value|status_word) }}</span>
{%- endmacro %}
{% macro tag(record) -%}
  <a class="sy-tag" href="{{ record.url }}">{{ record.id }}</a>
{%- endmacro %}
{% macro note(text, by, at) -%}
  <span class="sy-note">{{ text }}<span class="sy-note__by">— {{ by }} · {{ at|utc }}</span></span>
{%- endmacro %}
```

**Any component framework (React shown):**
```jsx
export const Status = ({ status, children }) =>
  <span className="sy-status" data-status={status}>{children}</span>;
export const Tag = ({ id, href, intent }) =>
  <a className={`sy-tag${intent ? " sy-tag--intent" : ""}`} href={href}>{id}</a>;
export const Button = ({ variant, size, ...p }) =>
  <button className={["sy-btn", variant && `sy-btn--${variant}`, size && `sy-btn--${size}`].filter(Boolean).join(" ")} {...p} />;
```
Wrap classes like this, but never re-implement the CSS in JS. The stylesheet stays the single source.

## 8. Behaviour the CSS expects from JS

| Pattern | JS responsibility |
|---|---|
| Assistant drawer | Ctrl J toggles `hidden` on `aside.sy-drawer`, moves focus to the message field, and Esc closes and returns focus. Switch the nav to `.sy-nav--compact` while open. |
| Context switch | Flip `aria-pressed` on the two segments; swap the context tags (`hidden`) and the textarea placeholder; send `context: page\|project` with each message. |
| Tabs | Roving tabindex; arrows move; `aria-selected` + `hidden` on panels. |
| Dialog | `dialog.showModal()`; Esc closes; focus returns to the trigger. |
| Toast | `role="status"`; auto-dismiss ≥ 10s unless it has Undo, then stay until dismissed or navigated. |
| Search | Ctrl K focuses `.sy-search input`. |
| Running pulse | Nothing: set `data-status="running"`. |
| Meter | Update `--value` and `aria-valuenow` together. |

## 9. Browser support

Evergreen browsers from 2023 on: Chrome/Edge 111+, Firefox 115+, Safari 16.4+. The newest
features used are cascade layers, unprefixed `mask` (with a `-webkit-` fallback), `:focus-visible`,
`aspect-ratio`, `<dialog>` and `inset`. Nothing needs a polyfill. No `color-mix()` or `:has()`
is required.

## 10. Extending the library

1. Check `components.html` and `04-design-system.md`: compose before you create.
2. If a pattern repeats across two or more screens, add it to `salvage.css` in `@layer sy.components`, using role tokens only.
3. Add a live example and its markup to `components.html`.
4. Document it in `04-design-system.md` §3 and, if it adds a meaning, in `03-colour-guide.md`.
5. Check contrast of any new pair (≥4.5:1 text, ≥3:1 UI), and check forced-colours and reduced motion.
