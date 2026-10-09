# Spec 015: Crawler hardening, the "now" set (R-28)

Branch `feature/015-r28-crawler-hardening` · Created 2026-10-09 · Status: draft

**Input**: roadmap R-28, the "now" set of the user's gap ranking
(`specs/009-legacy-proving-ground/gap-ranking.md`, 2026-10-08; the user's comments there are
requirements), spec 014 finding F-05 (the bank crawler never reached the legacy app). User,
2026-10-09: "plan it spec it create new branch. Divide work into opus sonnet and haiku".

## Problem

The crawler finds what it can act on only through ARIA roles, reads only the top document, records
only form fields that carry a `name`/`id`, and records only `xhr`/`fetch` calls. Real legacy portals
break all four assumptions: ARIA is rare ("a luxury, met very rarely in the wild"), apps are
composed of micro-frontends mounted on `div`s or wrapped in iframes and framesets, inputs sit in
wrapper `div`s without labels, and forms are submitted the classic way. On the proving ground this
leaves the bank crawl at 4 of 11 logged-in screens (none of the legacy app), the shop at 3 of 6 and
the insurer at 4 of 6 (spec 014 baselines). Eight known gaps (`gap()` cases in
`apps/crawler/packages/gates`) describe the wanted behaviour.

## Principles that shape the fixes

- **Capture more, not less** ([legacy rules]): when in doubt, record the element, the frame, the
  field, the request. Nothing found is dropped silently; what is left out is counted and logged.
- **Observed vs inferred** (constitution I): an element found only by a click signal (no role) and
  a field named from nearby text are recorded as such, so the BA can label them `inferred`.
- **One agent, deterministic tools** (constitution III, VII): detection of clickables, frames,
  mounts and fields is deterministic code the agent calls through the existing tools; the agent
  sees more actions, not new tools.
- **Safety unchanged** (constitution V): every new action goes through the same classification
  and action limits; a cross-origin widget (CAPTCHA) is never acted on.

## User stories

### US1 Clickable elements without ARIA are found and acted on (LO-10) — priority P1

The BA maps a legacy portal whose buttons are `div`/`span`/`li` elements with only a JS click
handler, no role and no `tabindex`.

- **AS1.1** Given the shop product page, when the crawler observes it, then "Dodaj do koszyka" (a
  `div` with a click handler) is issued as an action and `act` on it adds the product to the cart.
- **AS1.2** Given the bank transfer page, "Wykonaj" (a `div` button) is issued and can be acted on.
- **AS1.3** Each such action carries what it was found by (for example: pointer cursor, click
  listener, inline handler, framework handler) and a name taken from its visible text, `title` or
  `aria-label`; an element with none of them still gets an action and a locator.
- **AS1.4** An element that already has a clickable role is not issued twice; a clickable wrapper
  around an already issued element (a card whose only content is a link) is not issued again.
- **AS1.5** Each action has locators that resolve to that one element when the page is observed
  again (no generated class names, no duplicate ids, LO-13/LO-14 stay green).

### US2 Micro-frontends are waited for and observed, whatever mounts them (LO-02) — priority P1

- **AS2.1** Given a page whose content is mounted into a `div` (`id="root"`, `data-mfe`, a mount
  point) by a bundle loaded through an import map, SystemJS, RequireJS or a dynamic `import()`,
  when the crawler settles the page, then it waits until the mount point has content or a bounded
  wait (default 10 s, settable per portal) runs out, and records which happened.
- **AS2.2** Each observed page records its micro-frontend composition: the mount points found and
  the bundle URLs loaded for them (capture everything; the BA documents the architecture).
- **AS2.3** Given the bank `/bank/historia` page, which wraps the legacy app in a same-origin
  iframe, the inner page's content is part of the observed screen (`Lista operacji` appears) and its
  links and buttons are issued as actions and can be acted on.
- **AS2.4** A mount point still empty after the wait is reported to the agent and in the run trace
  (`mfe_mount_timeout`), never silently recorded as an empty screen.

### US3 Framesets are one screen with their frames (LO-04) — priority P1

- **AS3.1** Given `/legacy/bank/historia.do`, a frameset with a menu frame and a content frame, the
  observed screen contains both frames' content (`Historia operacji` appears), each under its frame.
- **AS3.2** Actions inside a frame are issued with the frame they live in and can be acted on.
- **AS3.3** A link in the menu frame that loads a page into the content frame is recorded as a
  transition from the frameset screen to the frameset screen with the new content, and the frame's
  own URL is recorded on the observation (capture every URL).

### US4 Fields without names or labels, and forms that are plain `div`s (LO-11) — priority P2

- **AS4.1** Given the bank transfer page, whose inputs have only a placeholder and no `name`/`id`,
  the recorded form has the fields `Numer rachunku` and `Kwota`.
- **AS4.2** A field's name comes from, in order: its label, `aria-label`, `aria-labelledby`,
  placeholder, the nearest preceding text in the same wrapper or table row, `name`, `id`. The
  record says which source gave the name.
- **AS4.3** A group of inputs with a submit-like control and no `<form>` element (React-rendered,
  submitted through a REST call) is recorded as a form; when the crawler submits it, the API call
  observed during that action is linked to the form.
- **AS4.4** The legacy insurer form `/legacy/insurer/szkoda-stara.do`, whose labels sit in the next
  table cell, gets field names from those cells.

### US5 Custom dropdowns and date pickers are operated (LO-18) — priority P2

- **AS5.1** Given the shop catalogue, the category and sort dropdowns built from `div`s are issued
  as actions (via US1); opening one shows its options, which are issued as actions in turn.
- **AS5.2** The options a custom dropdown offered are recorded as the field's allowed values.
- **AS5.3** Given the insurer add-on page, the `div` date picker "Data rozpoczęcia" can be opened
  and a day picked; the picked value is recorded on the step.

### US6 State shared between micro-frontends is seen as one change (LO-34) — priority P2

- **AS6.1** Given the shop product page, when the crawler acts on "Dodaj do koszyka", the shell's
  cart badge in another micro-frontend (shadow DOM) changes to `Koszyk (1)` in the resulting
  state, and the transition from the product page to that state is recorded.

### US7 Classic form POST + redirect is recorded (LO-43) — priority P2

- **AS7.1** Given `/legacy/insurer/szkoda-stara.do`, when the crawler submits the form (a full page
  POST, no XHR), then the POST is recorded as an API shape (method, URL template, body field names
  and shape) on the transition, together with the redirect that follows it (302 to `?ok=1`).
- **AS7.2** A plain GET navigation is not recorded as an API call (that is R-38's URL/redirect
  record); only document requests that carry a body or come from a form submission are.

### US8 A resumed run keeps its depths (F-04@004) — priority P3

- **AS8.1** Given a run interrupted at the depth limit and resumed, when the crawler returns to a
  page at the limit, then its links are refused exactly as before the interruption, for states and
  for URLs reached by `navigate`.

### US9 The fixes are proved on the goal — priority P1

- **AS9.1** Each fixed gap's case moves from `gap()` to `gate()` and stays green in `pnpm test:slow`.
- **AS9.2** New evals of the four baselines (one at a time, F-04@014) show `crawl_screens` up on
  the proving-ground portals and no regression on `reference-insurer`; results and causes are in
  `findings.md`.

## Edge cases

- A page with hundreds of pointer-cursor elements (a table where every cell is clickable): the per
  state action cap applies, the overflow is counted and logged, and repeated elements in a list
  are grouped like repeated links today.
- A cross-origin iframe (payment, CAPTCHA widget on `127.0.0.1:4101`): its content may be observed,
  but no action inside it is issued as allowed; `widget_actions` stays 0.
- An iframe or frame that never loads, or loads an error page: recorded with its URL and status;
  the outer screen is still recorded.
- Nested frames (a frame inside an iframe): handled to a fixed depth (default 3), deeper frames
  counted and logged.
- A micro-frontend that mounts, unmounts and remounts (route change inside the shell): the wait
  is per observation, not once per page load.
- An element whose click handler does nothing visible: acting on it gives a self-transition, as
  for any button today.
- A clickable element that is also an ancestor of a form control: issued once; the control keeps
  its own action.
- Same text, many clickables (`Szczegóły` on every row): `nth` disambiguates as today.

## Functional requirements

- **FR-001** Clickable detection is deterministic and runs in the page (main document and every
  observed frame); signals: pointer cursor (where the parent does not already have it), click/
  pointer/mouse listeners registered on the element, inline handler attributes, framework handler
  props, `tabindex`. Each found element becomes a candidate action with the signals that found it.
- **FR-002** Candidates found by signals are classified by the same safety rules as role-based ones
  (name, enclosing form, href when it has one); ambiguity stays unsafe.
- **FR-003** Every new kind of action (signal-found, inside a frame, custom option) is acted on
  through a locator that resolves to exactly one element; when it resolves to zero or several, the
  `act` result says so as today (`locator` event), never clicks a guess.
- **FR-004** The observed snapshot of a page includes the content of same-origin iframes and frames
  under a node naming the frame and its URL; cross-origin frames are recorded by URL and title only
  unless the portal's scope includes their origin.
- **FR-005** A page that has no iframes, frames or signal-found clickables keeps the fingerprint it
  had before this feature (stored states of existing portals are still recognised).
- **FR-006** Micro-frontend mounts: settle waits for known mount points to fill (bounded, per-portal
  setting `mfe_wait_ms`, default 10000), and the observation records mount points and bundle URLs.
- **FR-007** Form field names follow the order in AS4.2 and record their source; fields with no
  name from any source are kept with a positional name and counted.
- **FR-008** `div` forms (inputs + submit-like control, no `<form>`) are recorded as forms; the API
  call(s) during their submit action are linked to them.
- **FR-009** The network recorder also records document requests that carry a body (form POST),
  with the redirect chain that follows, as API shapes on the transition.
- **FR-010** Custom dropdown options observed after opening it are recorded as the field's allowed
  values; a picked date is recorded on the trace step.
- **FR-011** Resume rebuilds per-state and per-URL depths so the depth gate refuses the same
  actions after a resume as before.
- **FR-012** The agent's `crawler` prompt is updated only where its instructions assume ARIA-only
  actions or top-document pages; no new MCP tools.
- **FR-013** Every fixed gap is promoted to `gate()`; the catalogue's status for each is updated in
  `docs/legacy-obstacles.md`.
- **FR-014** Every bug or slip met on the way is logged in `specs/015-crawler-hardening/findings.md`
  with a test or eval idea.

## Key entities

- **Candidate action** (existing): gains `found_by` (signals) and `frame` (the frame path it lives
  in, empty for the top document).
- **Observation** (existing `state_observations`): gains the frames (path, URL, title, origin) and
  the micro-frontend mounts (mount point, bundle URLs, filled or timed out) seen on the page.
- **Form field** (existing, in `forms.fields_json`): gains `name_source`; forms gain `kind`
  (`form` or `div_form`).
- **API call** (existing `network_calls`): document POSTs and their redirects are API calls too.

## Success criteria

- **SC-001** The eight gap cases (LO-10, LO-02, LO-04, LO-11, LO-18, LO-34, LO-43, F-04@004) are
  `gate()` cases and pass in `pnpm test:slow`; no other gate regresses.
- **SC-002** Bank eval: `crawl_screens` at least 8 of 11 (baseline 4), including at least one
  legacy `/legacy/bank/*.do` screen.
- **SC-003** Shop eval: `crawl_screens` at least 5 of 6 (baseline 3); insurer eval at least 5 of 6
  (baseline 4).
- **SC-004** Reference-insurer eval: no regression beyond its tolerances.
- **SC-005** Every eval in SC-002–SC-004 keeps `password_hits` 0 and `widget_actions` 0.
- **SC-006** Stored states of the reference portal recorded before this feature are matched again
  by a crawl after it (fingerprints unchanged for pages without frames or new clickables).

## Assumptions

- The proving ground (spec 009) is the test bed; every gap already has a page there.
- Default wait for a mount point is 10 s and the default frame depth is 3; both are portal settings.
- Cross-origin frames outside the portal's scope are observed by URL only (safety, CAPTCHA widget).
- A signal-found element's name is taken from its visible text; it is labelled inferred for the BA.
- The R-28 order from the gap ranking is the build order; P3 (F-04) may land any time.

## Out of scope

Recording every URL and redirect of plain navigations (R-38), query parameter inventory (R-37),
the "next" and "later" gaps (R-35, R-36), BA quality (R-39), the crawler's stopping rule (spec 009
F-17), new MCP tools.

[legacy rules]: ../../docs/legacy-obstacles.md
