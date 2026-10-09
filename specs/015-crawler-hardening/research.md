# Research: Crawler hardening (spec 015, R-28)

Probe run 2026-10-09 against Playwright 1.63 (`locator.ariaSnapshot({ mode: 'ai' })` on a page with a
pointer-cursor `div`, a listener-only `div`, a placeholder-only input and an `srcdoc` iframe):

```text
- generic [active] [ref=e1]:
  - heading "T" [level=1] [ref=e2]
  - generic [ref=e3] [cursor=pointer]: Dodaj do koszyka
  - generic [ref=e4]: Wykonaj                      ← listener only: NOT marked
  - generic [ref=e5] [cursor=pointer]: Inner
  - textbox "Kwota" [ref=e6]                       ← placeholder already names it in ARIA
  - iframe [ref=e7]:
    - generic [ref=f1e1]:
      - link "Lista operacji" [ref=f1e2] [cursor=pointer]:
```

The default mode collapses the same `div`s into `- text: Dodaj do koszyka Wykonaj Inner` and shows
the iframe as an empty `- iframe` node. `aria-ref=eN` locators are only valid for the latest AI
snapshot of that page (count 0 after another snapshot).

## R1 How clickable elements without a role are found (LO-10)

- **Decision**: an in-page detector (`clickables.ts` in `@pathfinder/crawler`) run in every observed
  frame, plus an init script installed on the browser context before any page script runs. The init
  script wraps `EventTarget.prototype.addEventListener` and records `click`, `mousedown`,
  `mouseup`, `pointerdown`, `pointerup` and `touchstart` registrations on elements in a `WeakSet`
  (no DOM attribute, so the page and its fingerprint are untouched). The detector then walks the
  DOM and keeps an element without a clickable role when any signal holds: `listener` (in the
  WeakSet), `inline` (`onclick` and friends), `framework` (React `__reactProps$*`/`__reactEventHandlers$*`
  with `onClick`, Vue `_vei.onClick`, Angular `ng-reflect-*`/`(click)` hints where readable),
  `cursor` (computed `cursor: pointer` and the parent's is not), `tabindex` (≥ 0). Each element
  yields `{ name, found_by[], frame, tag, text, path }`.
- **Delegated handlers** (React 17+ attaches at the root): caught by the `framework` and `cursor`
  signals; a root-level listener alone is never treated as making every child clickable.
- **Dedupe**: skip an element that has, or is inside, an element with a clickable role, and skip a
  wrapper whose only clickable descendant is already issued (AS1.4); keep the innermost element
  that carries the signal when signals nest (`cursor` inherited down a subtree counts once, at the
  top where it starts).
- **Rationale**: the AI snapshot's `[cursor=pointer]` misses listener-only elements (probe: `Wykonaj`),
  and the LO-10 bank case is exactly that. The init script is the only way to see
  `addEventListener` registrations from page JS without the DevTools protocol per element.
- **Alternatives**: AI-mode `[cursor=pointer]` only (misses listener-only `div`s); CDP
  `DOMDebugger.getEventListeners` per node (one round trip per element, Chromium only, slow on big
  pages); writing `role="button"` into the DOM (changes the page and the fingerprint, and the page
  may react to it).

## R2 How the crawler acts on such an element

- **Decision**: a signal-found action keeps a locator chain that does not depend on snapshot refs:
  frame selectors (R3) then `getByText(<name>, { exact: true })` filtered to elements with the same
  tag and `nth`; fallback the DOM path by tag and child index (`div:nth-child(2) > span`), never
  classes or ids (LO-13, LO-14). `act` resolves it like role locators today and refuses on 0 or
  several matches (FR-003). Stored locators get `kind: 'text' | 'path'` and rank after role.
- **Rationale**: refs from AI mode are invalidated by every new snapshot (probe), and `act` runs
  after other observations.
- **Alternatives**: `aria-ref` (unstable); `data-pf-id` attributes injected on observation (mutates
  the page, breaks on re-render).

## R3 Frames and iframes (LO-02, LO-04)

- **Decision**: `observePage` walks `page.frames()` from the main frame, to depth 3. For each child
  frame it records `{ path, url, name, title, origin, same_origin }`. A same-origin frame (or one
  whose origin is in the portal's scope) is observed: its default-mode ARIA snapshot is nested
  under a synthetic node `- iframe "<frame name or url path>":` in the page snapshot, its forms,
  test ids and clickables are extracted with `frame` set to its path. A cross-origin frame outside
  scope is recorded by URL and title only and contributes no actions (CAPTCHA widget,
  `widget_actions` stays 0). A `<frameset>` page is the same walk (its top document has no body).
  Locators of actions in frames start with `frame=<path>` and `act` resolves through
  `page.frameLocator(...)` per level (selector from the frame's `name`, else its index among
  sibling frames, else its `src` path).
- **Fingerprint (FR-005)**: the fingerprint input is the top document's default snapshot exactly as
  today, with each observed frame's snapshot spliced in at its node. A page with no frames is
  byte-identical to today, so stored states still match (SC-006); a frameset whose content frame
  changed is a different state (US3 AS3.3).
- **Frame navigation**: an action inside a frame that only navigates that frame is a transition of
  the outer page (the top URL does not change); `settle` waits for the frame's load too. The frame's
  URL is recorded in the observation's composition (capture every URL).
- **Alternatives**: AI mode for the whole page (refs and cursor annotations change every stored
  fingerprint and need stripping, and the format is "optimized for AI", not a stable contract);
  observing only frames from the same origin by rule (loses the in-scope cross-origin legacy app
  some portals host on a sibling domain).

## R4 Waiting for micro-frontend mounts (LO-02)

- **Decision**: a `mounts.ts` probe in `@pathfinder/crawler` that finds mount points (`#root`,
  `#app`, `[data-mfe]`, `[id*=mount i]`, `[data-reactroot]`, `[ng-version]`, custom elements with a
  shadow root) and the module loaders in use (`<script type="importmap">`, `<script
  type="systemjs-importmap">`, `window.System`, `window.requirejs`/`define.amd`, dynamic module
  scripts seen by the network recorder). `settle` adds one condition: while a found mount point is
  empty and a loader is still fetching a script, wait (bounded by the portal's `mfe_wait_ms`, default
  10000). Bundle URLs come from the recorder's script requests (resource type `script`, recorded as
  composition, not as API calls). The result: `mounts: [{ selector, frame, filled, bundles[] }]`
  on the observation, `mfe_mount_timeout` trace event when a mount stayed empty.
- **Rationale**: the shell (`MfeHost.tsx`) fetches `/mfe/import-map.json` then `import()`s a bundle
  into an empty `div`; today's settle (network idle 500 ms, DOM quiet 300 ms) can pass between the
  map fetch and the bundle fetch on a slow bundle.
- **Alternatives**: a fixed extra wait (slow everywhere, still wrong on slow bundles); waiting for any
  empty `div` (every page has some).

## R5 Field names and `div` forms (LO-11)

- **Decision**: `extractForms` (observer.ts) is split into `forms.ts`; field naming follows spec
  AS4.2 order and writes `name_source` (`label`, `aria`, `placeholder`, `nearby_text`, `name`, `id`,
  `position`). `nearby_text`: the previous text node in the same wrapper `div` or the label-like
  cell of the same table row (insurer S08). Fields without `name`/`id` are kept (today they are
  dropped). A `div` form: a container (the closest common ancestor below `body`/mount point) with
  at least one input and a submit-like control (a `button`, `[type=submit]` or signal-found
  clickable named like submit: `Wyślij`, `Zapisz`, `Wykonaj`, `Dalej`, `Submit`, `Send`, `Save`,
  `Next`, list in config), not inside a `<form>`. Recorded as `kind: 'div_form'` with `method`/
  `action` empty; when its submit action runs, the API calls recorded on that edge are linked
  (`forms.fields_json.submitted_via` gets the call ids; no schema change).
- **Alternatives**: treating every input group as a form (noise on search boxes, filters).

## R6 Custom dropdowns and date pickers (LO-18)

- **Decision**: no widget-specific code. The trigger is found by R1, opening it is an `act`, the
  options appear in the next observation and are found by R1 too. What is added: when an `act` on a
  signal-found element yields a state whose new actions sit in a popup container that appeared
  (new subtree not in the previous snapshot), the transition records them as `options_shown`, and
  the BA side reads them as allowed values. A date picker: the day cells are clickables found by R1;
  a trace picks one like any option.
- **Rationale**: widget libraries are endless; the generic loop (find, open, see options) covers
  them, the gate proves it on the shop dropdowns and the insurer picker.

## R7 Shared state between micro-frontends (LO-34)

- **Decision**: no new mechanism; after R1 the add-to-cart click works, and the shadow-DOM cart
  badge is already in the snapshot (LO-05 gate). The gate is promoted once R1 lands. If the badge
  updates after the settle window (event bus + storage event), settle's DOM-quiet window covers
  it; a finding is logged if not.

## R8 Classic form POST (LO-43)

- **Decision**: the network recorder also takes requests with `resourceType() === 'document'`
  whose method is not GET (form POST), records them as API shapes with a form-encoded body schema
  (`application/x-www-form-urlencoded`, `multipart/form-data`: field names and value shapes, never
  file contents), and records the redirect chain (`request.redirectedFrom()` walk) as
  `redirects: [{ status, url_template }]` in `res_schema`. Plain GET navigations stay out (R-38).
- **Alternatives**: recording all documents (R-38's job, and it would flood `network_calls`).

## R9 Resumed depths (F-04@004)

- **Decision**: rebuild `depthByState` from the frontier's *source* depth (an item's `depth` is
  the depth of its target: the source state's depth is `depth - 1`) and `depthByUrl` from the
  run's state observations joined to their recorded URL and the depth of the state. First step of
  the task is to confirm the cause with the existing gap case.
- **Rationale**: `browser-runtime.ts` rebuilds `depthByState` from `frontier.depth` as is, and never
  rebuilds `depthByUrl`, which `navigate` uses.

## R10 Agent prompt

- **Decision**: `.claude/agents/crawler.md` gets two short lines: actions may come from click
  signals (`found_by`) and from frames (`frame`), and both are acted on with `act` as usual; an
  empty mount after a timeout is worth a re-`navigate` once. No other prompt change (FR-012).
