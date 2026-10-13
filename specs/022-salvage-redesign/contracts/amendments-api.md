# Contract: amendments with revisions (chat service, spec 022 M2)

Base: the chat service (`127.0.0.1:4310`); the dashboard forwards same-origin form posts under
`/chat/portals/{portal}/amendments…` (unchanged paths). Every successful write adds one row to
`amendment_revisions` and updates the `amendments` head in the same transaction. Bodies are JSON.

| Method · path | Body | Result | Errors |
|---|---|---|---|
| `POST /portals/{p}/amendments` | as today (`kind`, `target_kind`, `target_id`, `text?`, `attachment?`, `author`, `scope_id?`) | 201 head, `rev: 1` (`change: create`) | 400, 404, 409 as today |
| `DELETE /portals/{p}/amendments/{id}` | `{ "author", "base_rev"? }` (query `?author=&base_rev=` for the dashboard's button) | 200 head, `status: withdrawn` (`change: withdraw`) | 404; 409 not active; **409 `STALE_REVISION`** when `base_rev` ≠ head |
| `POST /portals/{p}/amendments/{id}/reanchor` (alias: `/reapply`) | `{ "target_kind", "target_id", "text"?, "author", "base_rev"? }` | 200 head, `status: active`, new target and anchor (`change: reanchor`); **same id and key** | 404; 409 not `needs_reanchor`; 409 `STALE_REVISION` |
| `POST /portals/{p}/amendments/{id}/dismiss` | `{ "author", "base_rev"? }` | 200 head, `status: dismissed` (`change: dismiss`) | 404; 409 not `needs_reanchor`; 409 `STALE_REVISION` |
| `PATCH /portals/{p}/amendments/{id}` | `{ "text", "author", "base_rev" }` | 200 head (`change: edit`) | 404; 409 not active; 409 `STALE_REVISION` |
| `POST /portals/{p}/amendments/{id}/restore` | `{ "rev", "author", "base_rev" }` | 200 head with revision `rev`'s text, target and status as a new revision (`change: restore`) | 404; 409 `STALE_REVISION` |
| `GET /portals/{p}/amendments/{id}/revisions` | — | 200 `[revision…]` oldest first | 404 |

`STALE_REVISION` body: `{ "error": { "code": "STALE_REVISION", "message", "latest": <head> } }` —
the dashboard shows the conflict notice (FE-P05) with Compare / Rebase.

After a scan finishes (step recorder, replaces `supersedeAfterRun`): for every active amendment
`amendmentOutcomes` (packages/workflow) decides; `carry_forward` writes a revision with the
successor target (`author: scan:<run id>`, `change: carry_forward`, `run_id`), `needs_reanchor`
writes one with `status: needs_reanchor` and the reason. The chat notice lists only the
needs-reanchor ones and points to Review.
