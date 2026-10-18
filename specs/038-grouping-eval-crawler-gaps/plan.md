# Plan 038

Each requirement lands in the layer that owns it; no new table except FR-008's kind.

| FR | Where | How |
|---|---|---|
| FR-001 | `apps/dashboard/.../static/js/assistant.js` | a document-level click on `a[data-chat-say][href]` stores the text (`assistant-say` in sessionStorage); every wired assistant sends a stored text on wire and on `idle`; `submit` while busy, or a 409, stores it and shows "The assistant is busy. This is sent when it finishes: …". Browser test `apps/chat/tests/chat-say-browser.e2e.test.ts` (closed drawer; busy then cancel). |
| FR-002 | `apps/chat/evals/` (new, the crawler eval's shape) | workspace = copy of a crawler-eval store with every grouping removed; one `claude -p` session with the orchestrator prompt, the chat handover and the regroup button's text, only `list_grouping_inputs` + `suggest_grouping`; code graders on the open suggestions vs the ground truth's processes cut at `last_observable_route`. |
| FR-003 | `fingerprint` `FingerprintIndex.seed`; `mcp-server` `services/known-clusters.ts`, `pipeline/fingerprint-step.ts`, `RunState.seededRoutes` | per route, on first sight in a run, seed the index with each known cluster (representative = its first revision's snapshot, masked, fingerprinted again; members = every recorded level 1). |
| FR-004 | `services/frontier.ts` (`describe`), `services/link-path.ts`, `pipeline/process-page.ts` (`link_to`), `.claude/agents/crawler.md` | an unnamed link with an http(s) href. |
| FR-005 | `crawler` `field-labels.ts` (`withFieldLabels`, called in `page-candidates.ts`), `action-extractor.ts` (`label`), `enqueue.ts` (stored), `record-transition.ts` (schema), `process-page.ts` (agent, test data) | inputs inside a `<form>` pair with the real forms' fields, outside any form with the `div_form` fields, per kind (text, select), only when the counts agree. |
| FR-006 | `probes` `catalogue/validation.ts` (`dateRange`), `registry.ts` | `date-range:<field>:past|future` for a date field side without `min` / `max`. |
| FR-007 | `services/shared-button.ts` (`inferSharedButton`), `same-target.ts` (`settleInferred` shared), `frontier.ts` | key = the container locator (`banner|navigation|contentinfo > …`); every earlier observed click of the key from another state went to one other state → inferred edge, `shared_button: <edge>`. |
| FR-008 | `docs-model` (kind, prefix, content), migration via `db-admin`, `docs` render, dashboard | see tasks; BA guidance waits for R-77 (the skill is frozen until the owner's review). |

Gates: LO-35 (one store, `gate`), LO-47 (trace, `gate`), LO-48 (trace + label, `gate`).
