# Spec 070: The assistant on Home, the scan line and the assistant's page actions (R-96, step 21)

**Branch:** `feature/070-r96-assistant-home` · **Owner (2026-10-23):** "Ok proceed I am going out
keep on working at it by yourself as much as you can". Spec 069 put the assistant drawer on every
portal page. The 2.0 Home (designer v2-01) has a compact Assistant beside "What changed, by
process" whose Ctrl J opens the full chat; the conversation's scan shows as one line in the
composer (FE-C02); the assistant can open a page or highlight an element (spec 022 R6,
`ui_action`). This step builds those three in React.

## What this step builds

- **FR-001 The scan line** (`queries_app_assistant.py`):
  - the conversation's run (`queries_chat.progress`): its status, scan or trace, steps used of
    the most, pages, queued, "Nothing for …" when a running run has been quiet five minutes,
    the way to the scan;
  - shown in the drawer's composer, fetched again every 3 s while the run runs.
- **FR-002 The Assistant on Home** (v2-01): a side plate beside Changes by process:
  - the suggestions;
  - the last scan's line;
  - a message box.
  - Sending, or a suggestion, opens the drawer and sends it there. A message waits in this
    browser's session until the drawer's conversation is ready, also across a page change (the
    htmx `assistant-say`).
- **FR-003 The assistant's page actions** in the stream (`ui_action`):
  - open a page (an address in the console);
  - highlight an element on a recorded screen (`/states/{id}?hl=`);
  - the drawer stays open on the next page.

## Not in this step

- The 1.x full chat page (`/chat`: the five-step tracker, the credentials form and the scope
  checklist, the live map): the 2.0 design has no full chat page beyond the drawer; the drawer's
  "Full page" keeps opening it on htmx.

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (145 tests; `tests/assistant.test.tsx`:
      Home's message sent in the drawer it opens and taken once; the scan line with its quiet
      mark and the way to Scans; page actions to addresses on this site only); `pnpm build`;
      `pnpm build-storybook`.
- [x] Dashboard: ruff; `tests/test_api_assistant.py` (the scan line of a running quiet run, a
      finished run, no run); the whole suite.
- [x] `ui:check` on Home at 1280 and 390 px, and the drawer check (scratch script) on Home with
      the drawer open (local-dev): all pass.

## Close-out review: feature/070-r96-assistant-home (2026-10-23)

Sizes, parameters and layers conform (G-01, G-04, G-13, G-15); no `any`, no lint suppression
(G-22, G-23); the file maps name the new files (G-30); pages and `src/app` compose only, the scan
line's statuses come from the API.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `apps/web/src/app/Shell.tsx:123-141` | style | The provider wrapped `AppShell` without re-indenting it. | Re-indented | small | fixed |
| 2 | `apps/web/src/app/Shell.tsx` `Shell` | G-02 | `Shell` grew to 82 lines. | The nudge and the `ask` handle moved to a `useAsk` hook | small | fixed |

Summary: 2 findings, 2 fixed. For the next drawer feature: `AssistantDrawer.tsx` is at 239 lines;
split out the conversation's parts first.
