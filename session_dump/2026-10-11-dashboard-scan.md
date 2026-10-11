# Session dump 2026-10-11: scanning our own dashboard

Asked by the owner during R-47: map the dashboard, have the BA document all its processes, export
the documentation (input for the planned UI redesign, and a test of how well Pathfinder documents
an app we know).

## Setup (how to repeat it)

- Portal `portals/pathfinder-dashboard/portal.yaml` (sandbox, `max_action_class: mutating`, robots
  ignored, SSE streams, htmx fragments and evidence files denied, item pages capped at 3) and
  persona `personas/pathfinder-dashboard/guest.yaml` (anonymous, `mutating`, en-US).
- The scanned dashboard is a throwaway copy on port 8790, so submitted forms touch no real data:

```bash
T=<scratch folder>
mkdir -p $T/data/db && cp data/db/sandbox.sqlite $T/data/db/
cp -r data/evidence data/exports data/evals $T/data/ && cp -r portals personas $T/
cd apps/dashboard && PATHFINDER_PORTALS_DIR=$T/portals PATHFINDER_PERSONAS_DIR=$T/personas \
  PATHFINDER_CHAT_URL=http://127.0.0.1:9 PATHFINDER_CRAWLER_DIR=$T/no-crawler \
  PATHFINDER_DOCS_DIR=$PWD/../../docs \
  uv run pathfinder-dashboard --env sandbox --port 8790 --data-dir $T/data
```

  No `PATHFINDER_REVIEWER`, so review actions are off; the chat service URL is a dead port, so
  the Chat page shows it unavailable and no credentials reach the vault.
- The scan itself is recorded in the real `data/db/sandbox.sqlite` like any other portal.

## Status

- Map run `01a12c39-2e04-7000-9066-92fd8694b9bf`, first attempt: about 17 states, then the
  crawler agent stopped on its own with 796 frontier items pending (finish_run refused,
  FRONTIER_NOT_EMPTY), so the run stayed `running`.
  - Not reached: New portal (no link to it; the dropdown option didn't navigate), record pages.
  - My config slip: `item_view_cap: 3` counts all item templates together, so it was spent after
    2 run pages and 1 state page. Raised to 18.
  - Refused: the Chat [send] button (external-side-effect, as intended); "Skip to content" and
    [save environment] (click_failed, 5 s timeout; worth a look for the redesign).
  - Eval idea: the crawler stopping early with a non-empty frontier, against its own procedure.
- Second attempt on the same run (the crawler agent, 212 tool calls, about 17 minutes):
  - `RUN_NOT_RESUMABLE` (a `running` run can't be resumed), so the agent carried on in the same run.
  - The run kept `item_view_cap 3`: a config change doesn't reach a live run.
  - Reached 37 states in all, including /portals/new and /portals/reference-insurer/settings.
  - Stopped again: `FRONTIER_NOT_EMPTY` with 1330 items pending, so the run is still `running`.
- **Crawler problems found (eval / R-45 candidates):**
  - **C1, items that can never run stay queued.** After `budget:max_actions_per_state` (40)
    trips on a state, each remaining item on it is still refused one call at a time (the counter
    reached 76 on Glossary). `finish_run` refuses while such items are pending, so a map run of
    a page with many controls can't end.
  - **C2, no way to end a stuck run.** There is no tool to stop or interrupt a `running` run, and
    a running run can't be resumed.
  - **C3, the Chat page multiplies states.** Each checkbox toggle in the Chat page's process scope
    made a new state (11 variants).
  - **C4, the crawler agent stops early.** Both attempts quit with the frontier full, against the
    agent's own procedure.
  - **C5, direct navigation adds depth.** /portals/new, reached by direct navigation, sat at depth
    7, so its actions were skipped (`max_depth` 6).
  - **C6, disabled buttons offered as actions.** [save portal and open chat], [save environment]
    (and the chat buttons) are `disabled` when the chat service is down, as it is in this copy
    (`portal_new.html:66`, `portal_settings.html:90`). The crawler still offered them and timed
    out on each click (5 s). "Skip to content" is a hidden skip link (`base.html:23`), the same.
    Neither is a dashboard bug; the crawler should skip disabled or hidden controls.
- **Consequence of the setup:** with the chat service down, saving a new portal or an environment
  can't be recorded; that needs a scan with a (throwaway) chat service. The "+ new portal"
  dropdown option didn't navigate for the crawler.
- Third attempt, run `01a12c4e-0520-7000-8b0f-9491786ce41f`: reached New portal, two settings
  pages, the four record kinds' pages (review buttons), another portal's docs and the
  add-amendment submit; still `running` with 299 frontier items (C4 again). Direct navigation hit
  `max_depth` 10 at depth 11 (C5).
- **Third attempt (new run):** `max_depth` 10, focus excluding /chat* and /glossary* (already
  mapped in the first run).
- BA session `01a12c50-5432-7000-a11b-4c70fa028943` (completed, both map runs, about 16 minutes):
  - Records: 14 screens, 6 capabilities, 14 processes (PROC-001…014), 16 business rules,
    4 requirements, 32 data items, 15 glossary terms, 3 NFRs, 2 assumptions, 3 open questions,
    8 follow-ups (trace requests).
  - Gaps it names:
    - no chat service and no reviewer in the copy, so no save, review or chat result was seen;
    - revoke and superseded amendments never shown;
    - the Glossary page and one state page too large to read;
    - run tabs other than States not visited.
- Export: `pnpm docs:export pathfinder-dashboard --env sandbox` →
  `data/exports/pathfinder-dashboard-sandbox-srs/` (163 files, 117 records, drafts marked).
- Throwaway dashboard stopped; port 8790 free. Runs `01a12c39…` and `01a12c4e…` stay `running`
  (C1, C2).
- **Round 2 (owner: "start the chat"):** the chat service runs from a throwaway git worktree.
  - Setup: `git worktree add --detach <scratch>/wt`, `pnpm install --offline`, the sandbox store
    and evidence copied in, port 4390, `PATHFINDER_VAULT_KEY_FILE` set to a throwaway key. The chat
    service writes `portals/` and `data/` relative to its own checkout, so it can't be pointed
    elsewhere.
  - The dashboard copy (8790) uses the worktree's data, portals and personas.
  - Persona and portal raised to `external-side-effect` (chat send), with `trace_inputs` added.
- Five traces, one per follow-up:
  - FUP-004 new portal: goal reached; saving opens /chat.
  - FUP-005 environment: save worked; revoke not done.
  - FUP-006 chat: one message, accepted (202).
  - FUP-007 scope: saved (201). Credentials stored: 200, "Credentials stored for TEST_USER.".
    - **My slip:** I first told the BA no credentials request reached the server; my log grep
      dropped every "200 OK" line. The BA kept its evidence and filed OQ-004 instead of accepting
      my note, which is the right behaviour.
    - Eval idea: the BA should prefer recorded evidence over operator context that contradicts it.
  - FUP-002 amendment: added (201).
- **More crawler problems:**
  - **C7, confirm dialogs.** [revoke] uses `onsubmit="return confirm(…)"`; the crawler can't accept
    the dialog, so nothing was sent. It then reported a "Please fill out this field" validation
    message that belongs to a different form on the same page.
  - **C8, the chat's portal picker.** Choosing a portal there returned `INTERNAL internal error`
    from the crawler's own server; no request reached the dashboard.
  - **C9, unlabelled fields.** The New portal form's three "Address" fields differ only by their
    fieldset legend, which the crawler doesn't see, so it guessed which one was sandbox. This is
    also a redesign note: give each field its own label.
  - **C10, chat answers invisible.** The crawler couldn't read the assistant's answer.
- BA sessions `01a12c70-0b32-…` and `01a12c7a-85dc-…` (completed), working in the traces:
  - created 6 use cases, PROC-015, BR-017/018, NFR-004, OQ-004/005 and FUP-009;
  - fully revised PROC-003/007/008/010/011, plus 4 screens, 6 rules and 8 data items.
  - Re-export: 184 files, 130 records.
  - Throwaway chat, dashboard copy, worktree and vault key removed; ports 4390 and 8790 free.
- Still open: FUP-001 (reviewer), FUP-003, FUP-005 (change, revoke), FUP-006 (scan from chat),
  FUP-008, FUP-009, OQ-001, OQ-005; withdrawing an amendment.
- **Next, if wanted:** a second copy with a throwaway chat service and `PATHFINDER_REVIEWER`, then
  trace runs for the 8 follow-ups (saves, reviews, chat), so the processes are documented end to
  end.
