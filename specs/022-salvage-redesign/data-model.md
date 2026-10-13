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
