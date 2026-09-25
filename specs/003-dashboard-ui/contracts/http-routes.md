# Contract: HTTP routes

All routes are `GET`, read-only, served on `127.0.0.1:8765` by default. Every route takes
`?env=<environment>` (default per research §7). Full pages extend `base.html`; fragments render a
single partial and are what htmx swaps. A request with header `HX-Request: true` to a page route
still returns the full page (htmx boosts are not used), so every URL is bookmarkable.

## Pages

| Route | Template | Content | Query params |
| --- | --- | --- | --- |
| `/` | `overview.html` | store info, one `PortalSummary` card per portal, runs table | `portal`, `status`, `cursor`, `page` |
| `/runs/{run_id}` | `run_detail.html` | run header + one section tab (states, actions, frontier, forms, network, robots, decisions) | `tab` (default `states`) plus that section's filters, `cursor`, `page` |
| `/healthz` | JSON | `{"ok": true, "store": StoreInfo}` | — |

Unknown `run_id` → 404 page with the not-found state (spec US2 scenario 4). Missing store → 200 page
with the error state naming the path (spec edge case); `/healthz` returns 503.

## Fragments (htmx targets)

| Route | Partial | Live? | Params |
| --- | --- | --- | --- |
| `/fragments/summary` | `partials/portal_cards.html` | yes | `portal` |
| `/fragments/runs` | `partials/runs_table.html` | yes | `portal`, `status`, `cursor` |
| `/fragments/runs/{run_id}/header` | `partials/run_header.html` (facts + tab bar with counts) | yes | `tab` |
| `/fragments/runs/{run_id}/states` | `partials/states.html` | yes | — |
| `/fragments/runs/{run_id}/actions` | `partials/actions.html` | yes | `safety_class`, `allowed`, `cursor` |
| `/fragments/runs/{run_id}/frontier` | `partials/frontier.html` | yes | `status`, `cursor` |
| `/fragments/runs/{run_id}/forms` | `partials/forms.html` | yes | — |
| `/fragments/runs/{run_id}/network` | `partials/network.html` | yes | `cursor` |
| `/fragments/runs/{run_id}/robots` | `partials/robots.html` | yes | — |
| `/fragments/runs/{run_id}/decisions` | `partials/decisions.html` | yes | `kind`, `rule`, `cursor` |

A live region is an element with `hx-get="<its fragment URL with current params>"`,
`hx-trigger="store-changed from:body"` and `hx-swap="outerHTML"`; the fragment re-renders the same
element, so its current filters survive refreshes. Filter forms and pager links add `push=1`; the
fragment then answers with an `HX-Push-Url` header holding the equivalent page URL, so a filtered or
paged view is shareable and survives reload. Live refreshes never send `push`. An empty form value
(`portal=`) means "any". `page` is the 1-based page number shown by the pager; `cursor` is opaque.

## Event stream

`GET /events` → `text/event-stream` (FastAPI `EventSourceResponse`):

```text
event: hello
data: {"boot_id": "<hex>", "data_version": 12, "dev": false}

event: store-changed
data: {"data_version": 13}

: ping
```

- `hello` once per connection; `store-changed` when `PRAGMA data_version` differs from the last
  value sent on that connection (checked every 1 s); a `: ping` comment every 15 s.
- `retry: 2000` on `hello` so the browser reconnects within 2 s.
- Every event carries `id: <store fingerprint>` (size and mtime of the store and its WAL).
  `data_version` is per connection and cannot identify a state across reconnects; the fingerprint
  can. A client reconnecting with a `Last-Event-ID` that differs from the current fingerprint gets
  `store-changed` right after `hello`, so changes made while it was disconnected are not missed.
- The stream does not carry HTML; regions re-fetch their fragment (research §3).

## Static

`/static/…` from the package's `static/` dir, `Cache-Control: public, max-age=3600` (fonts and
vendor files); pages and fragments `Cache-Control: no-store`.
