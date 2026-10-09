# Gap ranking (R-29, spec 014 T016)

The user's ranking of the 20 known crawler gaps from the R-27 gates (rating page
https://claude.ai/artifact/U5tVbfrdoD3rwvriT2resk, answers pasted into the session on
2026-10-08). It orders R-28 (now), R-35 (next) and R-36 (later); two answers became new items
(R-37, R-38). The user's comments are kept close to verbatim: they are requirements.

## Now → R-28

| Id | Gap | User's comment |
| --- | --- | --- |
| LO-10 | `div`/`span` "buttons" with click handlers, no role, no tabindex | **Top priority.** "Most legacy systems I worked on will have buttons with no ARIA. ARIA is a luxury and will be met very rarely in the wild." Also styled `div`/`li` elements that only have a JS handler. |
| LO-02 | Legacy app in an iframe inside the new shell | Not only iframes: every way a micro-frontend gets rendered. It is paramount to notice that something mounts on a `div` and is a whole process, or that SystemJS/RequireJS injects an `index.js` bundle of another front end (hints: `id="root"`, "mount point" in the code, unless there is a better way). Know when, and how long, to wait for it. |
| LO-04 | `<frameset>` / `<frame>` layout | — |
| LO-11 | Inputs without a label | Inputs often wrapped in several `div`s, rendered by React etc.; forms that are plain `div`s and submit through a REST API. |
| LO-18 | Custom dropdowns and date pickers built from divs | — |
| LO-34 | Cart shared between micro-frontends (storage / event bus) | — |
| LO-43 | Classic form POST + redirect (no XHR) | — |
| F-04@004 | Resumed run does not rebuild per-state / per-URL depths | — |

## Next → R-35

| Id | Gap |
| --- | --- |
| LO-08 | Missing CMS key shows the raw key |
| LO-27 | Pop-up windows (`window.open`) |
| LO-35 | Random A/B variant per session (plus the load-sensitive gate, spec 012 F-03) |
| F-14@004 | Trace runs count depth against the map budget |

## Later → R-36

| Id | Gap |
| --- | --- |
| LO-47 | Client-side and server-side validation disagree |
| LO-48 | Cascading fields loaded from an API |
| F-05@004 | `actions.allowed` / `skip_reason` stay as first issued |
| F-12@008 | Highlight crop cuts off labels to the right of a small control |
| F-13@004 | One claim marker is enough to match a rule, so scores run high |
| F-16@004 | Revising a record drops citations from runs outside the session |

## Changed by the user's answers

- **LO-24 (session id in the URL): dropped as stated, reversed.** "No. Opposite. We record ALL
  query params." They belong in the documentation: legacy systems have intricate inner
  dependencies where several query parameters are used in unexpected ways, and catching those
  dependencies is paramount. Pathfinder runs on test/dev systems, so capture everything, no
  security concern. → new item **R-37**. The LO-24 catalogue entry's expected behaviour
  ("strip it from route templates") must be rewritten there.
- **LO-23 (old and new URL schemes; unrated):** record every URL a screen was reached under,
  including URL changes from reloads and the React router (e.g. a SPA that reloads the page to
  authenticate), and every redirect. "We don't want to lose this knowledge." The crawler may not
  be equipped for this; DevTools-level capture may be needed (R-18). → new item **R-38**.
