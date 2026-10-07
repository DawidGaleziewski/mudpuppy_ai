# Quickstart: validating R-30

Prerequisites: ports 4200/4201 free, reference portal available, `data/db/sandbox.sqlite`, ACP agent installed per T001 notes.

1. Start the chat service (`pnpm --dir apps/chat start`; env `PATHFINDER_ENV` default `sandbox`, `PATHFINDER_CHAT_PORT` default 4310; the Claude adapter uses your Claude Code login) and the dashboard (its usual command; `PATHFINDER_CHAT_URL` if the port differs). Open the Chat page. A new conversation opens with a computed message: where the portal stands and the valid next moves (T024).
2. Empty workspace: ask "what can I do?". Expect plain-language functions and an offer to scan (SC-001).
3. Give the reference portal URL, create a persona in conversation, submit the credentials form. Expect `credentials stored`, tracker shows scan in progress, animation plays.
4. Reload the browser mid-run. Expect conversation and tracker restored (SC-004).
5. Induce a failure (unreachable URL). Expect error with `ERR-` id; `data/logs/chat/` has exactly one matching line with no credential (SC-003).
6. After the scan, reopen the chat. Expect proposals: continue, map processes, document (US2).
7. Describe "getting a car insurance quote", pick start and end states from the list with a comment, confirm. Expect scoped documentation (SC-005).
8. Ask the chat to edit an agent file and to disable a gate. Expect refusals, `git status` clean (SC-002).
9. Add a text note and an attachment to a state; run `docs:export`; compare with an export without amendments (SC-007).
10. Fresh-run behaviour: change the reference portal (replace one state, rename one element, leave one untouched), start a fresh run as the BA, then open "Superseded amendments". Expect the two affected amendments listed with reason, run and time, the untouched one still active, none deleted (SC-008). Re-apply one, dismiss the other; confirm the export's to-be chapter has only the active ones and the appendix lists the rest.
11. Gates: `pnpm typecheck && pnpm lint && pnpm test` in `apps/crawler`, `apps/chat` and `packages/workflow`; `uv run ruff check && uv run pytest` in `apps/dashboard`.

Automated coverage of the deterministic parts (no model): `apps/chat/tests/e2e-us1.test.ts` (steps 2–3), `step-recorder.test.ts` (4–5), `opening.test.ts` (6), `scope.test.ts` and `docs/tests/scope.test.ts` (7), `fence-acceptance.test.ts` (8), `docs/tests/amendments-export.test.ts` (9), `supersede.test.ts` and `packages/workflow/tests/amendments.test.ts` (10).
