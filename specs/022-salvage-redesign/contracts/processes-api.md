# Contract: BA process routes and tools of the chat service (spec 022 M5, T034)

The dashboard forwards these signed with the reviewer name (`author`); it never writes the
store. Every write is one revision row; a write on a stale base answers **409** with
`{ code: "STALE_REVISION", latest, message }` and changes nothing. Bodies are validated with Zod
(`apps/chat/src/process-bodies.ts`); an invalid body answers 400. Code: `process-service.ts`,
`process-suggestions.ts`, `process-store.ts`, `process-steps.ts` (pure), `api-processes.ts`.

| Method | Path | Body | Answer |
|---|---|---|---|
| POST | `/portals/:p/processes` | `{name, persona, state_ids[], author}` | 201 `{process, variant: A, revision: A r1}` (observed steps in the given order) |
| POST | `/portals/:p/processes/:id` | `{name?, stage?, base_rev, author}` | 200 the process head (one `rename` or `stage` revision) |
| POST | `/portals/:p/processes/:id/variants` | `{from = "A", from_rev?, author}` | 201 the new to-be variant (next label) and r1 = a copy whose steps come `from` the copied ones |
| PUT | `/portals/:p/processes/:id/variants/:L/draft` | `{base_rev, steps, author}` | 200 the author's draft (autosave; replaces their previous one). To-be only (409 on the as-is) |
| DELETE | `/portals/:p/processes/:id/variants/:L/draft` | `{author}` | 200 `{discarded}`; the last revision stays |
| POST | `/portals/:p/processes/:id/variants/:L/save` | `{base_rev, note?, author}` | 201 `{process, variant, revision}`: the author's draft becomes rN+1 and is removed. On a moved head: 409, the draft stays (an edit conflict) |
| POST | `/portals/:p/processes/:id/variants/:L/rebase` | `{author}` | 200 the draft, now based on the head, steps kept |
| POST | `/portals/:p/processes/:id/variants/:L/restore` | `{rev, base_rev, author}` | 201 a new revision with the steps of `rev` (`change = restore`) |
| POST | `/portals/:p/processes/:id/live` | `{environment, label, rev?, reason?, author}` | 201 the live marker (newest per environment wins) |
| POST | `/portals/:p/processes/:id/change-spec` | `{base_rev?, left: {label, rev}, right: {label, rev}, sections (all 7), author}` | 201 the change spec revision; `base_rev` must equal the newest one when there is one |
| POST | `/portals/:p/suggestions/:sid/accept` | `{name?, author}` | 201 `{process, variant, revision}` (`source = suggestion`); 409 `DECIDED` when not open |
| POST | `/portals/:p/suggestions/:sid/dismiss` | `{author}` | 200 the suggestion, `dismissed` |

Step validation (400 `INVALID` with every problem): unique ids; an `observed` step names a
recorded state of the portal; every `from` id is a step of the revision the variant was branched
from.

## MCP tools (pathfinder-chat, `mcp-process-tools.ts`)

- `list_grouping_inputs {portal}`: the newest revision of each screen, the executed links between
  them, saved processes with their as-is state ids, earlier suggestions with status. Read only.
- `suggest_grouping {portal, name, persona, state_ids, why}`: stores an `open` suggestion; refused
  with `DISMISSED` when the same set of screens was dismissed, `DUPLICATE` when it is already
  suggested or accepted.
