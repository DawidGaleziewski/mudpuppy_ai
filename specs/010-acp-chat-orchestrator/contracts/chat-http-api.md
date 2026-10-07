# Contract: chat service local API

Bound to `127.0.0.1` only. Used by the dashboard backend (server side), not by browser code directly. Exact paths may change in implementation; shapes below are the contract. ACP details: research.md R1/R2. Served with `node:http`.

| Method and path | Purpose |
| --- | --- |
| `POST /conversations` | Create or resume a conversation for a portal (optional). Returns id and current steps. |
| `POST /conversations/{id}/messages` | Send a BA message. Returns 202 and the message id. |
| `GET /conversations/{id}/events` | SSE stream: `message_chunk`, `message_done`, `tool_started`, `tool_finished`, `step_changed`, `error` (with `ref`), `idle`. Supports `Last-Event-ID` for reload. |
| `POST /conversations/{id}/credentials` | Form post: persona name, username, password. Stored via vault; response says only `stored: true`. Never echoed, never logged. |
| `POST /conversations/{id}/scope` | Save process scope (start/end/selected states, comments). |
| `POST /portals/{portal}/amendments` | Create an amendment (note, element ref, or multipart attachment). `DELETE` withdraws. |
| `POST /amendments/{id}/reapply` | Re-apply a superseded amendment to a chosen current state or element; creates a new active copy linked by `reapplied_as`. |
| `POST /amendments/{id}/dismiss` | Dismiss a superseded amendment. |
| `POST /runs/{id}/stop` | "Stop scan" (T041): a `running` run becomes `interrupted` (resumable); conversations following it get a notice. 200 `{run_id, portal_id, mode, status}`, 404 unknown run, 409 not running. Dashboard route `POST /chat/runs/{id}/stop`. |
| `POST /conversations/{id}/cancel` | The chat's [stop] button (T050): cancels the assistant's running turn (notice "You stopped the assistant…") and stops every `running` run the conversation's steps follow (each gets the T041 notice). 200 `{turn: bool, runs: [StoppedRun]}`, 404 unknown conversation. Dashboard route `POST /chat/conversations/{id}/cancel`. |
| `POST /conversations/{id}/reset` | [reset assistant] (T051): closes the assistant's session and clears `acp_session_id`; the next message opens a fresh one whose prompt carries the portal and steps (not earlier messages). Notice in the history. 200 `{reset: true}`, 404 unknown conversation, 409 while the assistant answers. Dashboard route `POST /chat/conversations/{id}/reset`. Every prompt may start with a "[Context from the chat service…]" block: missed notices on each turn, plus portal, steps and (after a lost session) the last messages in a new session (F-18, F-19). |
| `GET /conversations/{id}/events` (T048 addition) | Every connection starts with `event: status` `data: {"busy": bool}` and no `id:`: whether a turn is running, so a page opened mid-turn shows the assistant working. Replay after `Last-Event-ID` is unchanged. Progress itself (counters, activity feed) is read by the dashboard from the store: fragment `GET /fragments/chat/progress`. |
| `POST /portals` (spec 011) | "+ new portal" form: `{id?, robots: ignore\|respect, environments: {production\|staging\|sandbox: {base_url, max_action_class}}}` (at least one) → writes `portals/<id>/portal.yaml` (an `environments` map) and `personas/<id>/guest.yaml`, every environment checked with the run loader. 201 `PortalSummary {portal, persona, environments, files}`, 409 name in use, 400 bad address or loader refusal (nothing left on disk). Dashboard route `POST /portals/new` (form post). `POST /conversations` also takes `fresh: true` (never resume the portal's active conversation). |
| `GET /portals/{id}` (spec 011) | The portal's environments for the settings page. 200 `PortalSummary`, 404 unknown. |
| `PUT /portals/{id}/environments/{env}`, `DELETE …` (spec 011 FR-012) | Add or change an environment (`{base_url, max_action_class}`), or revoke one; the file is checked after the edit and put back on any problem; a legacy single-environment file is moved to the `environments` form. 200 `PortalSummary`, 400 bad env/address/loader refusal, 404 unknown portal, 409 revoking the last environment. Dashboard routes `POST /portals/{id}/environments` and `POST /portals/{id}/environments/{env}/revoke` (form posts). |
| `GET /errors/{ref}` | Developer lookup of a log entry (localhost only). |
| `GET /healthz` | Service and ACP agent status; includes code fingerprint like the dashboard. |

Errors: JSON `{ "ref": "ERR-...", "message": "plain language" }`. Reads of conversations, steps, scopes, amendments for rendering use the read-only store, not this API.
