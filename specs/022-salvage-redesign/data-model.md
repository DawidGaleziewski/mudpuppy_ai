# Data model: spec 022

Decisions in [research.md](research.md) R1–R5. M2 tables below; M5 (processes) is added later.

## M2 — screens and observed revisions (migration 0015_screens)

### `screens` (new)

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUIDv7 |
| portal_id | TEXT NOT NULL | |
| route_template | TEXT NOT NULL | |
| cluster_id | TEXT NOT NULL | |
| title | TEXT NOT NULL | title of the latest revision (display only) |
| first_seen_run | TEXT NOT NULL → runs(id) | |
| created_at | TEXT NOT NULL | ISO UTC |

`UNIQUE (portal_id, route_template, cluster_id)`.

### `states` (altered)

| Column | Type | Notes |
|---|---|---|
| screen_id | TEXT → screens(id) | NULL only for rows written by an old crawler before it learns the column |
| screen_rev | INTEGER CHECK (screen_rev IS NULL OR screen_rev >= 1) | r1, r2, … by first sighting within the screen |

`UNIQUE (screen_id, screen_rev)`; index on `screen_id`.

Backfill: one screen per distinct `(portal_id, route_template, cluster_id)`; `first_seen_run` and
`title` from its earliest / latest state; `screen_rev` by `created_at, id` within the screen.

Which revision a scan saw: `state_observations (run_id, state_id, persona_id)` joined to
`states.screen_id/screen_rev` — no new column.

## M2 — amendment revisions (migration 0016_amendment_revisions)

### `amendments` (altered: status vocabulary, current revision)

- `status` CHECK becomes `active | needs_reanchor | dismissed | withdrawn` (`superseded` rows are
  migrated to `needs_reanchor`; `superseded_*` columns stay as history of why).
- New `rev INTEGER NOT NULL DEFAULT 1` — the head's current revision number.
- New `screen_id TEXT → screens(id)` — the screen the amendment belongs to (backfilled from its
  target state); the target state moves to the newest revision when carried forward.

### `amendment_revisions` (new, append-only)

| Column | Type | Notes |
|---|---|---|
| amendment_id | TEXT NOT NULL → amendments(id) | |
| rev | INTEGER NOT NULL CHECK (rev >= 1) | PK with amendment_id |
| base_rev | INTEGER | the revision this one was written on top of; NULL for r1 |
| change | TEXT NOT NULL CHECK IN ('create','edit','carry_forward','needs_reanchor','reanchor','withdraw','restore','dismiss') | |
| author | TEXT NOT NULL | reviewer name, or `scan:<run id>` for automatic carry-forward |
| status | TEXT NOT NULL | same vocabulary as `amendments.status` |
| target_kind, target_id | TEXT NOT NULL | as on `amendments` |
| text | TEXT | |
| anchor_fingerprint, anchor_route_template, anchor_element | as on `amendments` | |
| reason | TEXT | why (e.g. `element_removed: the link "Zaloguj się" is gone`) |
| run_id | TEXT → runs(id) | the scan that caused a carry-forward / needs-reanchor |
| created_at | TEXT NOT NULL | ISO UTC |

Backfill: one `create` revision per existing amendment (rev 1), plus a `needs_reanchor` revision
(rev 2) for every superseded one.

## M3 — chat proposals (migration 0017_chat_proposals)

### `chat_proposals` (new)

Changes the chat assistant proposes and a person applies or discards (research.md R6). The assistant never
writes amendments; **Apply** runs the same revision write path as a BA edit (base check: a moved head makes the
proposal `stale`). Written only by the chat service.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUIDv7 |
| conversation_id | TEXT NOT NULL → chat_conversations(id) | |
| portal_id | TEXT NOT NULL | non-empty |
| target_kind | TEXT NOT NULL CHECK IN ('amendment','new_amendment') | `amendment` edits an existing one (text / re-anchor); `new_amendment` creates one |
| target_id | TEXT | the amendment id; NULL for `new_amendment`; no FK (polymorphic like `amendments.target_id`) |
| base_rev | INTEGER CHECK (NULL or >= 1) | the amendment revision the proposal was made on; NULL for `new_amendment` |
| payload | TEXT NOT NULL CHECK json_valid AND json object | e.g. `{"text": "…"}` or `{"target_kind","target_id","text","kind"}` |
| summary | TEXT NOT NULL CHECK length > 0 | the one line the drawer shows |
| status | TEXT NOT NULL DEFAULT 'open' CHECK IN ('open','applied','discarded','stale') | |
| applied_amendment_id | TEXT → amendments(id) | the created or changed amendment |
| applied_rev | INTEGER CHECK (NULL or >= 1) | the amendment revision that applying created |
| decided_by, decided_at | TEXT | set when applied / discarded / stale |
| created_at | TEXT NOT NULL | ISO UTC |

CHECKs: `amendment` needs `target_id` and `base_rev`, `new_amendment` needs both NULL; `applied` needs
`applied_amendment_id`, `applied_rev` and `decided_at`; `discarded`/`stale` need `decided_at`.

Indexes (one per read): `ix_chat_proposals_conversation (conversation_id, created_at)` lists a conversation's
proposals in the drawer; `ix_chat_proposals_portal_status (portal_id, status)` serves the Review inbox's open
proposals. Portal export/delete include the table (`PORTAL_TABLES`; deleted before `amendments` and
`chat_conversations`). Zod: `ChatProposal` in `@pathfinder/chat-model`; dashboard model `ChatProposal`.
Down: drops the table (open proposals are lost).

## As built (migrations 0015, 0016)

- **No separate `states.screen_id` index**: `ux_states_screen_rev (screen_id, screen_rev)` leads with it and
  serves "revisions of a screen". `screens` is served by its UNIQUE key. No index on `amendments.screen_id`
  or `amendment_revisions` beyond the PK `(amendment_id, rev)`: no contract query needs one yet.
- **Backfill ids**: screen ids are UUIDv7 built in SQL from the earliest state's `created_at` plus random bits.
  `screen_rev` counts states of the screen ordered by `created_at, id`. `screens.title` is the latest state's title.
- **Amendment backfill**: `rev` = 1 for `active`, 2 for the rest. Revision r1 is always `create` (status
  `active`). Rev 2 is `needs_reanchor` (from `superseded`; author `scan:<run>`, reason
  `<superseded_reason>: <superseded_detail>`, run = `superseded_by_run`), or `dismiss` / `withdraw` for dismissed
  and withdrawn rows, so every head equals its newest revision.
- **`amendments.screen_id`**: from the target state (`target_kind = 'state'`), else from the state with the
  anchor fingerprint in the same portal, else NULL (evidence and wireframe-element targets with no anchor).
- **CHECKs**: `amendment_revisions` requires `base_rev IS NULL` exactly for rev 1 and carries the same status
  and target-kind enums as `amendments`. The old `status <> 'superseded' ...` CHECK is gone; `superseded_*`
  columns are history only and unconstrained by status.
- **Down**: `0016` down maps `needs_reanchor` back to `superseded` (filling `superseded_at` from `created_at` and
  `superseded_reason` `state_replaced` when missing) and loses revision history; `0015` down rebuilds `states`
  (SQLite cannot drop a column that has a foreign key) and drops `screens`.
- **Portal export/delete** include `screens` and `amendment_revisions` (`PORTAL_TABLES`).

## M5 — BA processes (migration 0018_ba_processes)

A BA process is the BA's cut of the portal (screens 04–07), distinct from the crawler's trace
`processes` (spec 004) and from `process_scopes` (spec 010, migrated in). Same pattern as
amendments: a head row with the current revision number, append-only revision rows beside it.
Every write goes through the chat service (FR-011); a stale `base_rev` answers 409.

### Steps (JSON, in variant revisions and drafts)

An ordered array; each step:
`{"id": "s1", "title": "…", "route": "/…", "state_id": "…"|null, "screen_id": "…"|null,
"observed": true|false, "from": ["s2", "s3"], "annotations": [{"text": "…", "author": "…", "at": "…"}]}`.
`observed` steps point at a recorded state (as-is); drawn steps have no state ("Designed, not
observed"). `from` names the steps of the variant it was branched from that this step replaces
(one = changed, two or more = merged); a to-be step without `from` is added. The first step is the
start, the last the end. Ids are unique within a variant and kept across its revisions.

### `ba_processes` (new; head)

| Column | Notes |
|---|---|
| id TEXT PK | UUIDv7 |
| portal_id TEXT NOT NULL | |
| key TEXT NOT NULL | `PRC-001`…, UNIQUE (portal_id, key) |
| name TEXT NOT NULL | |
| persona TEXT NOT NULL | the persona the as-is was observed as |
| stage TEXT NOT NULL | `scoped` \| `as_is_documented` \| `to_be_design` \| `migrating` \| `migrated` (a process can move back) |
| rev INTEGER NOT NULL ≥ 1 | the head's current process revision |
| source TEXT NOT NULL | `suggestion` \| `scope` (migrated from `process_scopes`) \| `new` |
| scope_id TEXT → process_scopes(id) | the scope it was migrated from |
| suggestion_id TEXT → grouping_suggestions(id) | the accepted suggestion |
| created_at, updated_at TEXT NOT NULL | |

### `ba_process_revisions` (new, append-only)

PK (process_id, rev); `base_rev` NULL exactly for rev 1; `change` IN (`create`, `rename`,
`stage`, `restore`); `author`; `name`, `stage` (the values after the change); `created_at`.

### `process_variants` (new; head per variant)

| Column | Notes |
|---|---|
| id TEXT PK | |
| process_id TEXT NOT NULL → ba_processes(id) | |
| label TEXT NOT NULL | `A`, `B`, `C`…; UNIQUE (process_id, label) |
| kind TEXT NOT NULL | `as_is` (A, observed, rescans add revisions) \| `to_be` (drawn by people) |
| rev INTEGER NOT NULL ≥ 1 | the head's current revision |
| branched_from_variant_id TEXT → process_variants(id), branched_from_rev INTEGER | NULL for A |
| created_at TEXT NOT NULL | |

### `process_variant_revisions` (new, append-only)

PK (variant_id, rev); `base_rev` (NULL exactly for rev 1); `change` IN (`create`, `branch`,
`save`, `restore`, `observe`); `author` (reviewer name, or `scan:<run>` for `observe`); `steps`
JSON array (as above); `note` (the one line the history shows); `run_id` → runs(id) (for
`observe`); `restored_from` INTEGER (for `restore`); `created_at`.

### `process_drafts` (new; scratch, updated in place)

PK (variant_id, author): the open draft of one person over one to-be variant. `base_rev` (the
revision it was started from), `steps` JSON, `updated_at`. Saving deletes it after writing the
revision; Discard deletes it. A draft whose `base_rev` is older than the variant's head is an
**edit conflict** (Review "Edit conflicts", screen 07 notice): nothing is overwritten; Rebase
starts it again on the head keeping the draft's steps.

### `process_live` (new, append-only)

id PK; process_id, environment (`sandbox`|`staging`|`production`), variant_id, variant_rev,
author, reason, created_at. The live variant per environment is the newest row for
(process_id, environment). Index (process_id, environment, created_at).

### `grouping_suggestions` (new)

id PK; portal_id; name; persona; steps JSON (ordered as-is steps as above, all observed); why
(the assistant's reason); `screens_key` (the sorted state ids joined with `,`: a suggestion with a
dismissed `screens_key` is refused, FR-007); status `open`|`accepted`|`dismissed`;
conversation_id → chat_conversations(id) (nullable); process_id → ba_processes(id) (on accept);
decided_by, decided_at; created_at. Index (portal_id, status); index (portal_id, screens_key).

### `change_spec_revisions` (new, append-only)

PK (process_id, rev); base_rev (NULL exactly for rev 1); left_variant_id, left_rev,
right_variant_id, right_rev (what was compared); `sections` JSON object with keys `scope`,
`as_is`, `to_be`, `delta`, `records`, `migration_cut`, `open_questions` (strings or string
arrays); author; created_at; `doc_key` (the doc record key when saved to Docs, else NULL).

### Migration of `process_scopes` (T035, in 0018)

For the newest scope of each (portal, process name): one `ba_processes` row (`source = 'scope'`,
`stage = 'scoped'`, key in name order), its revision r1, variant A r1 with observed steps
start → selected (in route order) → end, author `BA`. Older scopes stay as they are.

### Portal export/delete

Every new table is in `PORTAL_TABLES` (children before parents).
