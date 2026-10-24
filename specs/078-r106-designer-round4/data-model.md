# Data model: spec 078 (migration 0051_process_scope_merge)

Designer T-05 (Add to process is a scope change; A stays observed-only) and T-06 (merge two saved
processes; Undo for 10 s; Split back later). `docs/design/salvage-yard/docs/10-processes.md` (add, merge,
their API).

## Changed

- `process_model_revisions.change` may also be `scope` (A rebuilt after screens joined the process's scope),
  `merge` (the kept process's A rebuilt over the merged scope) and `unmerge` (A put back when a merge is
  undone or split back). Table rebuilt, every row kept.
- `ba_process_revisions.change` may also be `merge` (the kept process renamed, or the absorbed one archived as
  merged into another) and `unmerge` (undone / split back). Table rebuilt, every row kept.

## New

### `process_scope_screens`

Screens a person added to a process's scope that no observed move reaches yet ("Not on the observed path
yet"): they are in the scope, in no step of A. A screen that an observed move links to A's screens joins A's
steps instead and gets no row here.

| column | type | notes |
|---|---|---|
| id | TEXT PK | UUIDv7 |
| process_id | TEXT NOT NULL → ba_processes(id) | |
| state_id | TEXT NOT NULL → states(id) | the screen's recorded state (as A's steps name it) |
| author | TEXT NOT NULL | who added it |
| added_at | TEXT NOT NULL | |
| removed_at | TEXT NULL | Undo, or it joined A after a later scan |
| removed_by | TEXT NULL | set with removed_at |

Unique while open: `(process_id, state_id) WHERE removed_at IS NULL`.

### `process_merges`

One merge of two saved processes of the same persona: one absorbs the other. Enough to put everything back
(Undo in 10 s, or Split back later from History).

| column | type | notes |
|---|---|---|
| id | TEXT PK | UUIDv7 |
| portal_id | TEXT NOT NULL | |
| kept_process_id | TEXT NOT NULL → ba_processes(id) | keeps its key, links, rules, docs |
| absorbed_process_id | TEXT NOT NULL → ba_processes(id) | archived as "Merged into …" |
| author | TEXT NOT NULL | |
| reason | TEXT NULL | the person's optional reason |
| kept_name_before | TEXT NOT NULL | the kept process's name before (the dialog may rename it) |
| kept_as_is_rev_before | INTEGER NOT NULL | A's head before the merge |
| kept_as_is_rev_after | INTEGER NOT NULL | the A revision the merge wrote |
| moved_json | TEXT NOT NULL, JSON array | `[{model_id, from_label, to_label}]`: the absorbed process's to-be models moved over |
| created_at | TEXT NOT NULL | |
| undone_at | TEXT NULL | Undo or Split back |
| undone_by | TEXT NULL | set with undone_at |

`CHECK (kept_process_id <> absorbed_process_id)`; one open merge per absorbed process:
unique `(absorbed_process_id) WHERE undone_at IS NULL`.
