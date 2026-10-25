# ADR-0023: The console is a React single-page app

- **Status:** Accepted
- **Date:** 2026-10-22 (spec 050, R-96 step 1); htmx removed 2026-10-23 (spec 071, R-100)
- **Supersedes:** [ADR-0008](0008-server-rendered-htmx-dashboard.md)

## Context

The console was Jinja + htmx (ADR-0008). On 2026-10-21 the owner asked for a React chat window
inside it as a POC ("If it does whole app goes react", R-92). On 2026-10-22 the owner chose React
for the live Workbench (R-96) and then for the whole console: "We go full change to React first,
then add the gen UI features … I want whole app to be React from now. Goal is no more htmx, just
React SPA app." After the first React pages, clicks between nav items took "forever": every link
was a plain `<a href>` that reloaded the app, and pages still linked out to slow htmx pages
(R-100).

## Decision

- A new app `apps/web`: Vite, React 19, TypeScript strict, React Router 7 under `/app/`, in the
  root pnpm workspace. It is the only UI.
- The dashboard's Python becomes a JSON API (`/api/...`, typed Pydantic response models) plus the
  chat relay, the evidence files and the built console. A console page has one read model
  `queries_app_<page>.py`, one router `web/api_<page>.py` and one React page (G-15).
- A design system of typed components with Storybook stories; the skill `mudpuppy-react-ui` holds
  the rules.
- R-100 (owner, 2026-10-23: "100% react spa. No htmlx. NOT A SINGLE LINE"): every in-app link
  goes through React Router; every htmx page got its React page; htmx pages, fragments, templates,
  static files and their tests were deleted; old addresses redirect to their React page, so
  evidence links, exports and bookmarks keep working.

## Consequences

- Good: a click between pages takes 30–120 ms with no page load; built files are cached for good.
- Good: component tests (Testing Library) and stories document each component.
- Bad: a JavaScript build chain and two languages per page (read model in Python, page in React).
- Bad: features were lost in the port and restored later (R-102: six of them).
- Bad: the first bundle was 859 kB until per-page code splitting brought it to 230 kB (spec 077).

## Alternatives considered

- Keep htmx + server templates (ADR-WB-1 option A, recommended by the designer for the beta).
- React only as an island inside the htmx console (the R-92 POC).
- React + Vercel AI SDK, React + a generative-UI kit, or a JSON → client renderer (ADR-WB-1
  options B–D).

## Sources

- `specs/050-r96-react-foundation/spec.md` (owner's 2026-10-22 night answers, FR-001–FR-005)
- `specs/071-r100-react-spa/spec.md`; `roadmap.md` R-92, R-96, R-100
- `CHANGELOG.md` R-96 step 1 (v2.6.0), R-100 (v2.7.0, Changed and Removed), R-102, spec 077 entry
- `docs/design/salvage-yard/docs/17-genui-architecture.md` § 1 (ADR-WB-1)
- `apps/dashboard/CLAUDE.md`; `CLAUDE.md` (Running the apps: "R-100: the only UI");
  `docs/code-guidelines.md` G-15
