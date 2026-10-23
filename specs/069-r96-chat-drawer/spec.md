# Spec 069: The assistant drawer in React (R-96, step 20)

**Branch:** `feature/069-r96-chat-drawer` · **Owner (2026-10-23):** "Ok proceed I am going out keep
on working at it by yourself as much as you can". The htmx assistant drawer (`web/chat.py`,
`views_chat.py`, `static/js/assistant.js`, `partials/drawer.html`, `assistant.html`,
`chat_messages.html`; spec 010 R-30, spec 022 M3 FE-A02–A05, R6) moves to the React console. The
chat service, its event stream and the dashboard's `/chat/…` JSON forwarders stay as they are.

## What this step builds

- **FR-001 The conversation** (`queries_app_assistant.py`, `GET /api/portals/{p}/assistant`):
  - the portal's newest active conversation (or the one asked for);
  - whether the chat service runs, with its start command when not;
  - the timeline in time order (`views_chat.timeline`):
    - the person's and the assistant's messages;
    - system lines;
    - failures with their ERR reference;
    - credential requests (name, environment, persona, why, stored or not; never a value);
    - the assistant's proposals (summary, target, status, a link to Review).
- **FR-002 The drawer** in the console's shell on every portal page:
  - "Ask the assistant" in the header and Ctrl+J open it; Esc and Close close it;
  - it stays open across pages in this browser;
  - This page or Whole yard (the page's context where a page names one: a screen, a process, a
    record, a scan), sent with each message (`page-context.ts`);
  - Start a conversation; send a message (Enter; Shift+Enter a new line);
  - the reply streams live over the existing `/chat/conversations/{id}/events` (EventSource;
    status, message chunks, tools, refused, error, notice, idle);
  - "what is happening now";
  - Stop (the turn and its scans);
  - Reset the assistant's context (asks first);
  - the suggestions;
  - a credential request's value stored in the vault (`…/credentials`, never shown again);
  - the full page conversation on htmx (`/chat`).
- **FR-003 Design system:** `Drawer` (`.sy-drawer` with head and context), `Message`
  (`.sy-msg`, a person's or the assistant's, a divider), `ChatLog` (`.sy-chat__log`, `role=log`)
  and `Composer` (`.sy-composer`), each with its story and test.

## Decisions for the owner

- D-1@069: a message and Stop go without a confirm, as on htmx: the message is the person's own
  words to the assistant (any write it leads to is a command card the person confirms), and Stop
  must act at once. Reset and storing a credential ask first.

## Not in this step (spec 070)

- The full chat page's step tracker, run progress, tools (credentials form, scope checklist) and
  live map; the assistant's browser actions (`ui_action`: open a page, highlight an element).

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (142 tests; `tests/assistant.test.tsx`
      with a fake EventSource: opened by the button and Ctrl+J, closed by Esc, the timeline; a
      message sent with its context, the reply streamed, Stop shown until idle; a credential
      stored after asking, its value never shown; start a conversation; the chat service
      stopped); `pnpm build`; `pnpm build-storybook`.
- [x] Dashboard: ruff; `tests/test_api_assistant.py` (the timeline with failures and credential
      requests, a stored credential, no conversation and the service stopped, another portal's
      conversation); the whole suite.
- [x] The page check (`ui:check`'s checks: axe, one h1, one primary, no page scroll, no console
      error) with the drawer open, by a scratch Playwright script because `ui:check` cannot open
      it: Docs and Processes without the chat service, a process with it (started for the check,
      stopped by its PIDs, no orphans; no message was sent): all pass at 1280 and 390 px. Found and
      fixed: the drawer grew the page past 6,000 px (it is now sticky at the window's height,
      its log scrolling); "This page" was not the default when the page's data arrived after
      the drawer opened.

## Close-out review: feature/069-r96-chat-drawer (2026-10-23)

Every new file under 400 lines (`AssistantDrawer.tsx` 224; longest function `Conversation`, about
72 lines); `api_assistant.py` imports a helper (`views_chat`), no router, and has no SQL (G-13,
G-15); the file maps name the new files (G-30); `src/app` and `src/pages` compose only, statuses
come from the API, agent and person text is shown as written, a credential value never shows,
Reset and storing a credential ask first; the inline layout of `Chat.tsx` and D-1@069 accepted.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| – | – | – | None | None | – | – |

Summary: 0 findings.
