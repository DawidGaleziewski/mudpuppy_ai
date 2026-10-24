# Frontend review: apps/web before the refactor (2026-10-24, master v2.9.0)

By skill `frontend-review`, rules FA-1…FA-7 of skill `frontend-architecture`.

## 1. Measures

| Measure | Value |
|---|---|
| Design-system components | 47 files in one flat `components/` folder (some files hold several: `WbParts`, `Layout`, `Chat`) |
| Pages / app files | 61 in `src/pages/`, 53 in `src/app/` (24 of them `api-*.ts`, 3045 lines) |
| Server-data queries | 53 `useQuery` in 30 files (TanStack Query), 6 mutations (one generic `useWrite`) |
| Direct `fetch` | `getJson` / `postJson` (the two helpers), plus the assistant's post and the live persona creator's vault post |
| `useState` | 188; `useEffect` 39; contexts 4 (frame, assistant, links, live Workbench) |
| Forms | 16 files with a form; 9 multi-field forms on one `useState` per field, validation by hand |
| URL state | `useSearchParams` in 25 files (filters, tabs, selection, paging: good) |
| CSS | the designer's `tokens.css` (149 lines), `salvage.css` (1185), `genui.css` (345), `fonts.css`; ours: `workbench-live/placeholder.css` (68 lines, hex colours, `wbx-` classes) |
| Inline `style` | 11, all custom properties or positions except the token story and the spike |
| Dead code (knip) | 14 unused exports, 1 unused dependency (`@testing-library/user-event`); 2 false positives (Mermaid loaded by URL, the token story); 52 exported prop types (public API, kept) |
| Duplication (jscpd, ≥ 8 lines) | 0.46 % of lines: the map canvas of `ScreensMap` / `RecordedMap` (40 lines), the dialog of `Confirm` / `RecordingDialog` (10), two licence texts (fonts, kept) |
| htmx | none in `apps/web` code (three comments that say what the htmx page did); the designer's htmx reference Workbench in `packages/workbench-contract/workbench/reference/` |
| TypeScript | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; no `any` |
| Commit checks | a Claude Code hook only (a terminal commit runs nothing) and it never checks `apps/web` |
| Bundle | main 714 kB (204 kB gzip); the live Workbench a lazy 332 kB chunk |

## 2. Findings

| # | Where | Rule | Finding | Size | Outcome |
|---|---|---|---|---|---|
| 1 | `src/design-system/components/` | FA-1 | One flat folder: no atoms, molecules, organisms; nothing stops an atom importing an organism | large | T040, T011 |
| 2 | `src/app/api-*.ts` | FA-3 | Server data on TanStack Query; the owner's rule is RTK Query | large | T050 |
| 3 | 9 forms (`SettingsModel`, `Settings`, `NewPortal`, `NewProcess`, `ScanPlan`, `ScreenAmendments`, `Changes`, `PersonaForm`, `PersonaCreator`) | FA-3 | One `useState` per field, validation by hand | large | T051 |
| 4 | `workbench-live/placeholder.css` | FA-4 | Loose CSS with literal colours and its own class prefix | small | T031 |
| 5 | design system | FA-4 | No utility classes; spacing only through `Stack`/`Cluster`'s one gap | large | T030 |
| 6 | `ScreensMap.tsx` / `RecordedMap.tsx` | FA-2, FA-6 | The map canvas (zoom bar, graph view, inspector wiring) copied (40 lines) | small | T021 |
| 7 | `Confirm.tsx` / `RecordingDialog.tsx` | FA-2, FA-6 | The modal dialog's open/close and head copied; no `Dialog` | small | T021, T041 |
| 8 | knip list | FA-5 | 14 unused exports, an unused dependency | small | T020 |
| 9 | `.claude/hooks/pre-commit-check.sh` | FA-7 | No web checks; not a git hook | small | T012 |
| 10 | — | FA-4, FA-6 | No stylelint, knip or jscpd in the checks | small | T010 |
| 11 | `api-assistant.ts`, `PersonaCreator.tsx` | FA-3 | Two `fetch` calls outside the API layer | small | T050 |

## 3. State management today, and the target

- **Server data.** Every page reads through hooks in `api-*.ts` (`useScreens`, `useReview` …) over
  TanStack Query; keys are arrays per page; writes go through one `useWrite(refresh)` that
  invalidates a key prefix; live scans poll every 2 s (`refetchInterval` while a scan runs); the
  assistant's SSE and the Workbench stream invalidate keys. It works and is consistent.
  **Target:** RTK Query: one `api` (`createApi`) whose base query keeps the data store and As of
  (`getJson`'s rules) and `ApiError`; endpoints injected per domain, typed once; tags per domain
  instead of key prefixes; `pollingInterval` while a scan runs; the streams invalidate tags.
  Pages keep their hook names, so the change is inside the API layer.
- **Forms.** Settings, new portal, new process, plan a scan, amendments, the change range, the
  persona forms: each field its own `useState`, checks written in the submit handler, errors in
  another `useState`. **Target:** React Hook Form with a zod schema per form (`zodResolver`);
  the design system's `Field` shows `formState.errors`; one free-text composer (the assistant, the
  Workbench) stays local state.
  **Done (T051):** the persona form (one `usePersonaForm` + `PersonaFields` for Settings, the beta
  and the live Workbench; test data by `useFieldArray`), the environment, hints and budgets forms,
  new portal, new process (the ordered steps are a form value), plan a scan, add an amendment.
  **Kept local, on purpose:** the Changes range and filters (the URL is the state; the selects only
  build the next link), an amendment's one-field "new wording", the composers, and the live
  persona card's login and password (never in the form's values, which are sent and kept).
  Tests share one async `confirmIn` and one jsdom dialog stub (`tests/render-at.tsx`,
  `tests/setup.ts`) instead of 5 and 16 copies.
- **UI state.** Local where it belongs (a dialog open, a copied flag, the picture's zoom); the
  frame and the assistant in two contexts; selection, filters and tabs in the URL. **Target:** as
  is. One improvement: the frame's `useLayoutEffect` hand-up stays (it avoids a blink, spec 073).
- **Derived state.** Few effects copy state; most derive in render. Keep.

## 4. Improvements, in order

1. **Checks first** (T010–T012): stylelint, knip, jscpd and the layer rules in the hook, so every
   later step is held to them. Benefit: the rules stay true after this branch. Risk: none.
2. **Dead code and the two clones** (T020–T021). Small, safe.
3. **Utilities and `Box`, our CSS on tokens** (T030–T031). A rebrand is then a token change: our
   CSS has no literal left, and pages space through typed props.
4. **Atomic folders and compound `Dialog`** (T040–T041): a move behind the same `index.ts`, so
   pages do not change; the layer rule keeps it so. `Plate` keeps its props: its parts are fixed
   (title, actions, foot), a compound API would only move the same props into children.
5. **RTK Query** (T050): the largest change, inside the API layer; the page tests (they stub
   `fetch`) prove it.
6. **React Hook Form** (T051) on the nine forms.

Left as is: the designer's CSS (a copy); the URL state; the contexts.

## 5. Open questions

1. The designer's htmx reference Workbench (`packages/workbench-contract/workbench/reference/`) is
   their deliverable, not our code, and nothing runs it but its own tests; remove it, or keep it
   until R-94 (5)'s comparison? Kept for now.
2. `Plate` as a compound component touches 52 pages for no new behaviour; kept on props (rule 4).

## 6. Close-out review (T060, the code-reviewer with `frontend-architecture` and `frontend-review`)

Measures on the branch: typecheck, ESLint (layer and styling rules), stylelint, knip and jscpd
clean; 0 clones; no `className` or `style={{` in pages, app or features; no CSS literal outside
the designer's `assets/`; largest file `src/pages/ScanTrace.tsx`, 372 lines (limit 400); no
design-system file imports `app/`, `pages/` or `features/`; the pre-commit hook in place.

| # | Rule | Where | Finding | Outcome |
|---|---|---|---|---|
| 1 | FA-5 | `WorkbenchCards.tsx`, `PersonaCreator.tsx` | Four `as unknown as` casts (an `interface` is not assignable to `Record<string, unknown>`) | Fixed by the reviewer: `PersonaArgs` is a `type`, two casts gone, two plain `as` |
| 2 | FA-3 | `SelectedStep.tsx` (Change this step), `ProcessSteps.tsx` (+ Add step) | Two-field forms on a `useState` per field, checks in the submit handler | Fixed: one `useStepForm` (zod: a title first, both trimmed) for both; the title's error is now said (it was silently ignored); two new tests |
| 3 | FA-3 | `ProcessCompare.tsx` (change spec) | Section texts in one `useState` map | Fixed: React Hook Form, a row per section by index (a key never breaks a field path) |
| 4 | FA-3 | `Screens.tsx`, `RecordedPages.tsx` | Filters without `useForm` | No finding: URL-driven filters, as the rules want |
| 5 | FA-3 | `api-assistant.ts` `chatCall` | A raw `fetch` outside `state/` | Fixed by a move, not by RTK Query: `chatCall` is the chat service (not the JSON API), a turn's answer comes over the stream, and the credential card's values must never be kept in the store. It lives in `state/http.ts` next to `storeCredential`, which now uses it: the assistant's credential card and the live persona card share one vault call (were two `fetch`es) |
| 6 | FA-5 | `organisms/Graph.tsx:189` | `eslint-disable-next-line react-hooks/exhaustive-deps` | Acceptable: names the rule and why |
| 7 | FA-5 | `stories/TokenTable.tsx:1` | `eslint-disable no-restricted-syntax` | Acceptable: the token catalogue paints tokens by hand |

Single-field forms that stay local state, by the rule: an annotation, an amendment's new
wording, "Add a recorded screen" (one select).
