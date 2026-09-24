# Data Model: Portal-Agnostic Safety and Portal Workspaces

Changes on top of the spec 001 Layer A schema (`data/migrations/0001_init.up.sql`), delivered as
one reversible migration `0002_portal_workspaces` by the `db-admin` subagent, following the
`sqlite-conventions` skill (STRICT tables, UUIDv7 text ids, ISO ms timestamps, JSON checked with
`json_valid`). The `data/schema/` snapshot and the Zod records in `core` are updated with it.

## Changed tables

### `states` — add `portal_id`, unique per portal (FR-026, FR-027)

| Column | Change |
|---|---|
| `portal_id TEXT NOT NULL` | New. Backfilled from `runs.portal_id` of `first_seen_run`. |
| `ux_states_fingerprint` | Dropped; replaced by `UNIQUE (portal_id, fingerprint)` (`ux_states_portal_fingerprint`). |
| `ix_states_cluster_id` | Replaced by `(portal_id, cluster_id)` so cluster lookups stay per portal. |

SQLite cannot add a `NOT NULL` column without a default and backfill in one statement, so the
table is rebuilt (create new, copy with the join to `runs`, drop old, rename), with foreign keys
from `state_observations`, `actions`, `edges`, `forms` and `frontier` checked after the copy
(`PRAGMA foreign_key_check`).

**Rule**: a state's `portal_id` equals the `portal_id` of every run that observes it. Enforced by
the recording service (it looks up states by `(portal_id, fingerprint)` of the current run);
the migration verifies it for existing rows.

### `frontier` — new status `robots_disallowed` (FR-003)

`status` CHECK becomes `('pending','done','skipped_unsafe','out_of_scope','denylisted',
'robots_disallowed','budget_reached','unreachable')`. Table rebuild (CHECK change). `reason` is
required for it, like the other skip statuses.

### `decision_log` — new kind `note` (FR-009)

`kind` CHECK becomes `('skip','refuse','merge','split','warning','note')`. A `note` records an
observation that did not change the run's course, used for the page's own requests to
robots-disallowed URLs (blocked or allowed, deduplicated per run by URL template and rule).
Table rebuild (CHECK change).

## New tables

### `robots_policies` — one fetched `robots.txt` per host per fetch (FR-001 to FR-007)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUIDv7 |
| `run_id` | TEXT NOT NULL → `runs(id)` | run that fetched it |
| `host` | TEXT NOT NULL | lower-case host, e.g. `www.liveinsurer.example` |
| `source_url` | TEXT NOT NULL | `https://<host>/robots.txt` |
| `final_url` | TEXT | after redirects; null when unreachable before a response |
| `outcome` | TEXT NOT NULL | CHECK IN (`rules`,`no_rules`,`unreachable`) |
| `http_status` | INTEGER | null on network error or timeout |
| `product_token` | TEXT NOT NULL | e.g. `PathfinderAI-Crawler` |
| `group_used` | TEXT | the User-Agent line of the applied group (`*` or the token); null unless `rules` |
| `crawl_delay_s` | REAL | from the applied group; null if absent |
| `ignored_lines` | INTEGER NOT NULL DEFAULT 0 | malformed lines skipped |
| `truncated` | INTEGER NOT NULL CHECK IN (0,1) | body cut at 500 KiB |
| `content_sha256` | TEXT | hash of the body; null when there is no body |
| `evidence_ref` | TEXT NOT NULL | evidence record of the fetch (always present, even for 404 or failure) |
| `fetched_at` | TEXT NOT NULL | ISO ms |

Index: `(run_id, host, fetched_at)`. The latest row per `(run_id, host)` is the policy in force.
The evidence record is JSON: `{ source_url, final_url, redirects[], http_status, outcome,
fetched_at, body }`, where `body` is the raw text (robots files carry no personal data; the PII
scrubber still runs over it before writing, as for all evidence).

### `portal_data_log` — operator exports and deletions (FR-028)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUIDv7 |
| `portal_id` | TEXT NOT NULL | no FK: it outlives the deleted runs |
| `environment` | TEXT NOT NULL | the DB file's environment |
| `action` | TEXT NOT NULL | CHECK IN (`export`,`delete`) |
| `operator` | TEXT NOT NULL | name given with `--operator` |
| `counts_json` | TEXT NOT NULL | `json_valid`; rows per table and evidence files copied or removed |
| `target` | TEXT | export directory; null for delete |
| `created_at` | TEXT NOT NULL | ISO ms |

Never deleted by `portal:delete`.

## Config snapshot additions (`runs.config_snapshot`, JSON)

- `robots`: `{ product_token, page_requests: "block" | "allow_and_record", policies: [{ host,
  policy_id, outcome, evidence_ref }] }` for the hosts fetched at start; later fetches are in
  `robots_policies`.
- `rule_set`: the resolved rule ids with class and origin (`builtin`, `portal`, `builtin+portal`)
  so a run can be re-explained without the portal file.

## Entities (spec Key Entities → storage)

| Entity | Stored as |
|---|---|
| Robots policy | `robots_policies` row + evidence record |
| Robots decision | frontier `robots_disallowed` item or decision-log `refuse`/`note` with `rule: "robots:<line>"` and `detail.policy_id` |
| Action rule | built-in: code (`safety/src/rules.ts`); portal: `action_rules` in the portal file; resolved set in the config snapshot |
| Rule alias | code constant `RULE_ALIASES`; visible in refusals as `alias→generic` |
| Denylist entry | portal file (`url:` new); unchanged storage |
| Portal workspace | `runs.portal_id` + `states.portal_id` partition all gathered rows; config folders `portals/<portal>/`, `personas/<portal>/` |
| Portal data export | `data/exports/<portal>-<env>-<timestamp>/` + `portal_data_log` row |

## Partition map (what "all data of a portal" means for export and delete)

| Table | Belongs to portal P when |
|---|---|
| `runs` | `portal_id = P` |
| `states` | `portal_id = P` |
| `state_observations`, `actions`, `edges`, `forms`, `network_calls`, `frontier`, `open_questions`, `rule_candidates`, `decision_log`, `robots_policies` | `run_id` in P's runs |
| evidence files | referenced by any of the above; deleted only if no row of another portal references the same file |
| `schema_migrations`, `portal_data_log` | never part of a portal's data |

Delete order (one transaction, foreign keys on): `decision_log`, `network_calls`, `frontier`,
`actions`, `edges`, `forms`, `open_questions`, `rule_candidates`, `robots_policies`,
`state_observations`, `states`, `runs`; then evidence files outside the transaction, after commit,
from the list computed inside it.

## Down migration

Reverses in order: drop `portal_data_log` and `robots_policies`; rebuild `decision_log` and
`frontier` with the old CHECKs (fails if rows use `note` or `robots_disallowed`, which is the
safe outcome); rebuild `states` without `portal_id` (fails if two portals share a fingerprint,
since the old global unique index cannot hold them).
