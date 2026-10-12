# Data model: spec 019

All schema changes go through `db-admin` conventions (G-16): Zod schema in the owning model package,
reversible migration, regenerated `data/schema/schema.sql`, dashboard read model + drift test.

## Migration 0012_page_visits

### New table `page_visits`

One row per arrival on a page during a run (FR-001, FR-002, FR-006).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | ULID-style id like the other tables |
| `run_id` | TEXT NOT NULL → `runs(id)` | |
| `state_id` | TEXT NOT NULL → `states(id)` | the state observed on arrival |
| `edge_id` | TEXT NULL → `edges(id)` | the action edge that led here; NULL for `navigate`, re-login returns |
| `via` | TEXT NOT NULL CHECK IN (`navigate`, `action`, `relogin`, `login`) | how the step reached the page |
| `url` | TEXT NOT NULL CHECK length > 0 | verbatim final URL of the main frame (masked only when the portal sets `pii_scrub`) |
| `hops_json` | TEXT NOT NULL DEFAULT `'[]'` CHECK json array | ordered `NavigationHop[]` from the step's start URL to `url` |
| `created_at` | TEXT NOT NULL | ISO time |

Indexes: `(run_id, state_id)`, `(state_id)`. STRICT.

Down migration drops the table.

### `network_calls.url` (ALTER TABLE ADD COLUMN)

`url TEXT` nullable: verbatim request URL (NULL on rows before 0012). Masked only with `pii_scrub`.

### Form-POST `req_schema` (no DDL; JSON shape change, F-08)

Before: `{ "<field>": "<type>", …, "content_type": "…" }`. After:
`{ "content_type": "…", "fields": { "<field>": "<type>", … } }` for document (classic form) calls.
XHR/fetch bodies keep their shape (`Shape` of the JSON body). Readers that look at document
`req_schema` (BA `network_calls` summary, evaluator field matching, dashboard API tab) accept both
shapes (old rows).

## Migration 0013_relation_triples (F-12)

No new table or column, no index. Two triggers on `doc_relations` (`trg_doc_relations_triple_insert`,
`trg_doc_relations_triple_update`) look up the kinds (`doc_revisions.record_id` → `doc_records.kind`
for the source, `to_record_id` → `doc_records.kind` for the target) and `RAISE(ABORT,
'RELATION_NOT_ALLOWED: ...')` unless the (from kind, type, to kind) triple is in `RELATION_RULES`
(`@pathfinder/docs`). Down: drops both triggers; relations are untouched. Drift test:
`packages/docs/tests/relation-triples.test.ts`. Existing stores held 0 bad relations (checked), so the
migration cannot fail on data.

## Zod (owner: `@pathfinder/core`, crawl model — used by crawler, store, mcp-server, docs)

```ts
export const HopKind = z.enum([
  'start', 'navigate', 'http', 'meta_refresh', 'script', 'same_document', 'reload', 'blocked',
]);
// `navigate` (added while building T007): the step's own document load — the link or form an
// action followed; for a `navigate` step it is omitted when it equals the `start` URL.
export const NavigationHop = z.object({
  url: z.string().min(1),
  kind: HopKind,
  status: z.number().int().optional(),      // http only
  reason: z.string().optional(),            // blocked only: why not followed
});
export const PageVisitVia = z.enum(['navigate', 'action', 'relogin', 'login']);
export const PageVisit = z.object({
  id: Id, run_id: Id, state_id: Id, edge_id: Id.nullable(),
  via: PageVisitVia, url: z.string().min(1),
  hops: z.array(NavigationHop), created_at: IsoDate,
});
```

`core` holds it because it describes the crawl model itself and three feature packages read it
(G-09).

## Read models (no tables)

### `UrlParam` (fingerprint, kernel, pure)

`parseUrlParams(url): UrlParam[]` with `{ name, value: string | null, in: 'query' | 'path' |
'fragment_query', position }`; repeated names kept, `?flag` → `value: null`; path parameters from
`;name=value` segments (`;jsessionid=…` → `{ name: 'jsessionid', in: 'path' }`).

### `ParameterInventory` (docs, pure)

Per state:

```ts
{
  state_id, route_template,
  entry_urls: { url, visits, via: PageVisitVia[], first_hop_kinds: HopKind[] }[],  // AS2.4
  params: {
    name, in, visits,                  // number of visits carrying it
    values: (string | null)[],         // first 20 distinct, first-seen order
    distinct: number,                  // total distinct values
    set_by: { edge_id: string | null; hop: HopKind }[], // where a value first appeared / changed
  }[],
}
```

Entry URLs are the distinct verbatim URLs (bounded at 50 per state, with a count of the rest).

### `MountWait` (crawler)

Gains `frames: { url: string; probe: MountProbe; timedOut: boolean }[]` (FR-009); the event
`mfe_mount_timeout` carries `frame` = the frame URL (empty for the top document, as today).

## BA model changes (`@pathfinder/docs-model`)

- `EvidenceTargetKind` gains `page_visit` (the visit id).
- `data_item.seen_in[].kind` gains `page_visit` (a parameter documented as a data item).
- `RunEvidenceKind` (mcp-server) gains `page_visits` and `parameters`.

## Config (`@pathfinder/config`, portal `scope`)

`client_redirect_wait_ms: z.number().int().min(0).max(30000).default(5000)` — longest meta-refresh
delay followed, and the bound per client-side hop (FR-007). Hop cap fixed at 5.

## Dashboard store (Python, no DDL)

`Store = { key: str, label: str, data_dir: Path, env: str, kind: 'main' | 'eval', mtime: float }`;
`key` is `main:<env>` or `eval:<workspace dir name>`, resolved server-side.
