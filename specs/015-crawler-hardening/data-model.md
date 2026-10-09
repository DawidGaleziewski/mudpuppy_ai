# Data model: Crawler hardening (spec 015, R-28)

One migration (`0011_page_composition`, through `db-admin`, G-16); everything else rides in
existing JSON columns, whose Zod schemas gain optional fields (old rows still parse).

## `state_observations` (existing table): new column

| Column | Type | Rule |
| --- | --- | --- |
| `composition_json` | TEXT NULL | JSON `PageComposition`; NULL on rows from before 0011 |

```ts
PageComposition = {
  frames: { path: string; url: string; name: string | null; title: string | null;
            origin: string; observed: boolean; depth: number }[];   // observed = content in snapshot
  frames_skipped: number;                                            // deeper than the frame depth
  mounts: { selector: string; frame: string; filled: boolean; waited_ms: number;
            bundles: string[] }[];                                   // full bundle URLs
  loaders: ('importmap' | 'systemjs' | 'requirejs' | 'dynamic_import')[];
  clickables: { found: number; issued: number; capped: number };
}
```

`path` is `""` for the top document, `"0"`, `"0/1"` for nested frames (child index), with the
frame's `name` kept separately for locators.

## `actions.action_json` (existing JSON): optional fields

| Field | Type | Rule |
| --- | --- | --- |
| `found_by` | `('listener'\|'inline'\|'framework'\|'cursor'\|'tabindex')[]` | present only on signal-found actions; their `role` is `generic` |
| `frame` | string | frame path; absent for the top document |
| `tag` | string | element tag of a signal-found action, for the path locator |
| `locators[].kind` | adds `'path'` | DOM path by tag and child index; never classes or ids |

## `forms.fields_json` (existing JSON)

- form: optional `kind: 'form' | 'div_form'` (absent = `form`), optional `frame`, optional
  `submitted_via: string[]` (network call ids linked when its submit action ran).
- field: optional `name_source: 'label' | 'aria' | 'placeholder' | 'nearby_text' | 'name' | 'id' |
  'position'`. A field named by `position` is `field_<n>`.

## `network_calls` (existing table)

Document POSTs are rows like any API call: `method` POST, `url_template`, `req_schema` with the
form fields (content type in the schema's `content_type`), `res_schema` gains optional
`redirects: { status: number; url_template: string }[]` and `kind: 'document'`.

## `transitions` / edges

Optional `options_shown: { action_id: string; name: string | null }[]` in the edge JSON when an
act opened a popup whose new actions are the options (R6).

## Trace events (`@pathfinder/trace`)

- `mfe_mount_timeout { selector, frame, waited_ms, bundles }`
- `frame_skipped { path, url, reason: 'cross_origin' | 'depth' | 'load_failed' }`
- `clickables_capped { found, issued }`

## Read side

The BA server's evidence reads (`get_run_evidence`, `get_evidence`) return `composition` with an
observation and the new action/field fields unchanged as they come; no BA tool changes.
