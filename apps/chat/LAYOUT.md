# @mudpuppy/chat: file map

What each module does, by spec. The agent notes (`CLAUDE.md`) keep the rules; this file
keeps the map (spec 042 T050, G-30).

## Modules

- `acp-client`: ACP session lifecycle.
- `api`: HTTP endpoints and SSE.
- `service`: orchestrator core logic.
- `mcp-chat`: MCP chat tool definitions.
- `session-config`: session setup (prompt, tools, MCP servers).
- `step-recorder`: workflow step recording.
- `amendments`: amendment commands (create, withdraw, re-anchor, dismiss, edit, restore);
  `amendment-revisions`: the one write path (every change is a row in `amendment_revisions`, a
  stale `base_rev` answers 409 `STALE_REVISION`); `api-amendments`: their HTTP routes;
  `reanchor`: after a scan, carries amendments forward or flags them for re-anchoring (spec 022);
  amendments anchored on the portal model (`ref_id`, spec 039 T074) only when their screen was
  split, merged or retired or their element is no longer seen.
- `http-io`, `http-error`: JSON in/out and the HTTP error with machine-readable extras.
- `page-context`: the message's page context and the line the agent gets; `ui-actions`: completed
  browser tools → `ui_action` events (a credential request is also kept in the history);
  `mcp-page-tools`: the page tools.
- `proposals` (propose_change writes an open `chat_proposals` row), `proposal-service`
  (apply / discard / undo through the amendment write path), `api-proposals` (their routes).
- BA processes (spec 022 M5, contracts/processes-api.md): `process-steps` (pure step rules),
  `process-bodies` (request schemas), `process-store` (loads, the revision write with base check),
  `process-service` (create, rename/stage, branch, drafts, save, rebase, restore, live, change
  spec; A and B are process models, `…/models/{label}/…`, spec 039 owner answer 8), `process-suggestions` (the assistant's groupings: suggest, accept, dismiss, split, merge),
  `api-processes` (routes), `mcp-process-tools` (`list_grouping_inputs`, `suggest_grouping`).
  Spec 078 (R-106): `process-scope` (Add to process: a scope change, A rebuilt from what scans
  observed, screens no move reaches stay in the scope) and `process-merge` (merge two saved
  processes of one persona, Undo for 10 s, Split back from History; spec 079: a review comment
  on the absorbed one's PROC record), both routed by `api-processes`.
  Spec 027 (R-54): archive / unarchive (never delete), `models/A/edit` (a person's edit of A,
  an `edit` revision), sign-off records `as_is_rev`, and `process-from-record` (a PROC record
  opens a process linked by `record_key`; routes `…/processes/from-record`).
- `portals`, `personas`, `credentials`: portal/user data. `test-data` (`save_test_data`, spec 032:
  merge test values into an existing persona's `test_data`). `persona-add` (spec 072, `persona.add`:
  a persona from a form or a confirmed card, credential `X` = `X_LOGIN` + `X_PASSWORD`; its Undo;
  `POST /portals/{p}/personas`, `DELETE …/{name}` in `api-portals`).
- Probe suites (spec 032 US3): `probe-suites` (approve: kept variants, changed expectations, the
  trace written into `portals/<p>/traces.yaml` with comments kept; dismiss) and
  `api-probe-suites` (`POST /portals/{p}/probe-suites/{id}/approve|dismiss`). Probe marks
  (US5): `marks` and `api-marks` (`POST|DELETE /portals/{p}/marks`); `request_scan`
  `form_probing` starts a form-probing scan. Spec 034 (R-66): all six mark kinds on their targets
  (`MARK_TARGETS`); `request_scan` `run_type` + `plan` (continue, focused, recheck, retry) with
  `scan-directed.ts` (the checks and the crawler brief: reach each start point with `go_to_state`).
- `scan`, `scope`: process scanning and scope management. Spec 080: `sample-scans`
  (`request_sample_scans`: the persona sample of `@mudpuppy/config`, every persona checked
  first with `scan`'s `checkScanTarget`, then the next one without a finished scan since the
  batch began; stateless, one scan at a time).
- Spec 039 (T077): `mcp-model-tools` (`list_process_proposals`, `name_proposal`,
  `reconcile_model`, `model_actions`: the model's proposals to name, a rebuild, the probe work
  waiting for the owner to start).
- Spec 039: `api-model` (`POST /portals/{p}/model/accept`: τ or the classifier, Settings;
  `…/model/decide`: confirm or reject hypotheses from Review, all keys in one transaction;
  `…/model/label`: a Same screen? answer for two page versions; a confirmed A/B test adds its
  cookie to `portal.yaml` `model.experiment_flags` through `portals.addExperimentFlag`;
  spec 040: `…/model/undo` takes back one decide command, `…/model/reword` rewords a hypothesis),
  `PUT /portals/{p}/hints` (`portals.setHints`: Settings ▸ Hints and Budgets write release
  marker, experiment flags, business errors, replay budget and probe limits into `portal.yaml`,
  spec 040 T021),
  `check-runs` + `api-check-runs` (headless check runs, one per portal).
- `fence`: permission control.

- Spec 042: the HTTP routes per resource: `api-portals`, `api-conversations` (create,
  messages, events, credentials, scope; stop, reset, a run's stop, errors) beside the other
  `api-*` files, wired in order by `api`; `scan-prompts` (the crawler briefs of
  `request_scan`); `mcp-workflow-tools` (workflow state, personas, scans, scope, amendments).

- Spec 043 (Workbench, generative UI beta): `agents/workbench.md` (the assistant's prompt and
  tools); `workbench-session` (its session: Workbench prompt, crawler subagent only, the chat MCP
  server in Workbench mode; its fence: read and compose, the crawler only with a confirmed
  command's prompt, `Launches`); `mcp-workbench-tools` (`render_view`, `propose_command`: the
  designer's schemas, checked with `@mudpuppy/workbench-contract`, one view per turn);
  `workbench-commands` (proposals, one-time tokens, Confirm, expiry; the audit row; spec
  044: a Start card's chosen persona, else the newest scan's; spec 072: `persona.add`, its edited
  args on Confirm and Undo; spec 079: the chosen persona kept on the row); `workbench-again`
  (spec 079, D-4: Start again copies a start that did not start and runs it, once); `workbench-settle` (the timer's pass; a start follows its own scan step's run, and a step that
  failed before its run fails the start, spec 073); `workbench-persona` (spec 044: the
  persona name check and the `guest`-else-first fallback); `workbench-envs` (spec 048, D-6: the
  environments where commands may run, `MUDPUPPY_WORKBENCH_COMMAND_ENVS`, default local-dev and
  sandbox; a proposal and a confirm elsewhere are refused `PAUSED`);
  `workbench-cards` (the card actions the dashboard drives); `workbench-service` (conversations,
  turns with their context, Path switch, feedback, the day's cap); `workbench-context` (the
  context before each message, portal text in `<scan_data>`); `workbench-events` (`wb_*` events
  off the agent's tool events); `workbench-turn` (the turn counter); `workbench-telemetry` (JSON lines in `data/logs/workbench/`);
  `api-workbench` (routes). `ChatService.sendEvent` (an event turn) and `policyFor` (a fence per
  conversation). Evals: `evals/workbench/` (`pnpm eval:workbench`).

- Spec 075 (the live Workbench, R-96 spike): `agents/workbench-live.md` (the live assistant's
  prompt: the same views and commands, `ask_choice`, no subagent); `workbench-live` (live
  conversations, `goal = 'workbench-live'`; the live and the runner's sessions; the runner's fence);
  `scan-runner` (a confirmed scan in a background ACP session; its tool events to the step
  recorder); `workbench-milestones` (started, finished, stopped told to the live assistant once
  each, `result_json.told`); `workbench-choices` (`ask_choice`: a system message
  `workbench_choice`; the answer's event line); `workbench-actions` (`POST
  /workbench/conversations/{id}/actions`: `choice.answer`, `persona.new`, `scan.stop`,
  `scan.resume`).
