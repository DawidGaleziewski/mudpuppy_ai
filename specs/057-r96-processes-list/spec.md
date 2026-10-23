# Spec 057: the Processes list in React (R-96, step 8)

**Branch:** `feature/057-r96-processes-list` · **Owner (2026-10-23):** "Proceed work as long as you
can without my help"; the htmx pages move to React one at a time. Processes is split in two: this
step moves the list (designer screen 04) with its writes; one process, Compare and History (screens
05–07, the to-be editor) are the next steps.

## What this step builds

- **FR-001 The list's API** `GET /api/portals/{p}/processes` (`archived`, `page`) over
  `queries_processes` (`web/api_processes.py` over `queries_app_processes.py`): the processes (key,
  name, persona, first and last route, stage mapped, each model with its kind, revision and an open
  draft, live per environment, screens, amendments, the last change), 25 a page; the archived count;
  the stages in order (the legend); the open suggestions (their routes, why); the screens in no
  process with their pictures. 404 for an unknown portal.
- **FR-002 The list's writes**, `POST` under `/api/portals/{p}/` answering `{ok, message, href}` as
  every console write (403 another origin, 409 no reviewer, 422 a bad body, 502 the chat service's
  refusal): `processes` (`name`, `persona`, `state_ids` in walking order), `processes/{id}/unarchive`
  (`base_rev`), `suggestions/{id}/accept`, `…/dismiss`, `…/split` (`at`), `…/merge` (`with`). They
  send the calls the htmx forwarder sends (contracts/processes-api.md), signed with the reviewer;
  a new or accepted process answers its page's address (`href`).
- **FR-003 The page** `/app/portals/:portal/processes`: the head with New process; the stages; your
  processes (or the archived ones, with Restore) with their pages; the suggestions as drawn plates
  with Accept, Edit first, Dismiss, Split before a step, Merge with another; the screens in no process
  with their pictures, ticked in walking order into the new process's numbered steps (move up, down,
  remove). Every write asks first (`Confirm`) and says what happened. The nav gains Processes.

## Not in this step

- One process (A and its to-be models, documentation, sign-off), Compare, History, the change spec
  export: htmx until the next steps; the list links there (`/processes/{key}`).
- "Ask the assistant to regroup" opens the htmx chat (the chat drawer moves later).

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (69 tests: the list and its links,
      Accept after a confirm with the new process's link, Merge with the other suggestion picked, a
      new process from screens ticked and reordered, the archived view); `pnpm build`;
      `pnpm build-storybook`.
- [x] Dashboard: ruff and the whole suite; `tests/test_api_processes.py` (the list's shapes, a
      signed accept answering the new process, a new process's body, a refusal, 403/404/409/422).
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px on the list (in use, archived) of two
      local-dev portals: all pass. Found on the way: the screens' thumbnails filled the row (a
      10 000 px page); `Picture size="sm"` keeps them at 96 px, also on Recorded pages and States.

## Close-out review: feature/057-r96-processes-list (2026-10-23)

No SQL in routers, the write helpers shared from `web/chat_writes.py` (G-13, G-15), files and
functions within G-01–G-04, pages compose only, statuses through `ShownStatus`, writes through
`ConfirmedWrite`; `Picture size="sm"` has its story.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `apps/web/CLAUDE.md` Layout | G-30 | `api-processes.ts` and `Ask`'s `follow` / `onDone` not in the notes. | Added | small | fixed |

Noted: Edit first opens the htmx process page (`window.location.assign`) until that page moves;
`write_answer` treats 201 as ok (no older path answers 201).
