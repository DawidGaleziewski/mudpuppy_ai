# Contract: differing states (BA tools, chat route, Review)

## BA tool `list_differing_states` (`pathfinder-ba`)

Input: `{ portal_id: string, route?: string }` (route narrows to groups touching that route).
Output: `{ groups: DifferingStatesGroup[], verdicts: string[], hypotheses: string[] }` (data-model).
Groups are computed from the store on each call; each carries its latest `reconciliation`
(`status`, proposal, confirmed verdicts). Errors: `PORTAL_UNKNOWN`.

## BA tool `propose_verdicts` (`pathfinder-ba`)

Input:
```json
{ "portal_id": "reference-insurer", "group_key": "action:…:button:Oblicz składkę",
  "verdicts": [ { "state_id": "…", "verdict": "main", "hypothesis": "temporary",
                  "reason": "seen in 2 of 3 scans as the quote form; the 503 page once" } ] }
```
Rules: the group must exist now (else `GROUP_UNKNOWN`), one verdict per outcome state, no other
states (`VERDICTS_INCOMPLETE`), verdict and hypothesis from the lists (`SCHEMA_INVALID` naming the
lists), reason 1–400 characters. Stores a `reconciliations` row `proposed` with the group snapshot;
an open proposal for the key becomes `superseded`. Output `{ id, status: "proposed", superseded? }`.
Needs a BA session (`start_session`), like the other BA writes.

## Chat route (`apps/chat/src/api-reconciliations.ts`)

`POST /portals/{p}/reconciliations/{id}/confirm`, body
`{ author: string, verdicts: [{ state_id, verdict }] }` (one per outcome of the proposal).
200 `{ id, status: "confirmed" }`; 404 unknown id or other portal; 409 not `proposed` (already
confirmed or superseded); 400 a verdict outside the list or a state not in the proposal.

## Review kind "Differing states" (dashboard)

`KINDS` gains `("differing", "Differing states")` after `differences`. Items = `reconciliations`
with status `proposed` for the portal (Q4: groups without a proposal are not listed). The item
(screen 16): the graph point, outcomes as cards (`.sy-card`, technical/temporary not red), the
evidence table, hypotheses checked (from the reasons), the documentation preview
(`.sy-drawn`), and the side intent plate with one select per outcome (pre-set to the proposal) and
**Confirm verdicts** (primary), posting to the dashboard route
`POST /review/differing/{id}/confirm`, which forwards to the chat route with `PATHFINDER_REVIEWER`.
