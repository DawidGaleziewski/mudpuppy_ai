# What carries over to A2UI (R-96)

> **Update, 23 Oct (round 3):** A2UI's current version is **v0.9.1** (v1.0 candidate, v0.8 legacy). The v0.9.1 names are
> `createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface` and the client's `action`. The generated catalog,
> example streams and binding rules are in `../19-console-answers/13-a2ui-catalogue.md` and `workbench/a2ui/`. The table
> below still holds; read the v0.8 names as their v0.9.1 equivalents.

R-96 moves the Workbench from our view-spec contract to **A2UI**, an open protocol in which an agent describes UI as JSON
messages and the client renders it from a catalog of components it knows. As documented for spec v0.8, a server sends
`beginRendering` (a surface, its root, an optional `catalogId`), `surfaceUpdate` (components with an `id`, containers listing
child ids), `dataModelUpdate` (values at paths in the surface's data model) and `deleteSurface`. A component property is either
a literal or a `path` into the data model. Check the spec version you adopt; the names below follow v0.8.

The design decisions of the Workbench don't depend on our contract, so they carry over. This is how.

| Our design | In A2UI |
|---|---|
| **Catalogue only** (D-38): the model places only our 15 components | A **custom catalog** (`catalogId` e.g. `mudpuppy-workbench/1`) with exactly those components. Don't allow the standard layout components (Row, Column, Card…) to the agent; placement stays the server's job (path + phase) |
| **The model chooses; the data speaks** (D-39) | The agent sends `surfaceUpdate` with components bound by **path**; only the **server** sends `dataModelUpdate` for observed data (events → data model). Reject or strip agent-sent values under observed paths (`/scans/…`, `/records/…`). The agent may write only its own words: `why`, suggestions, narration lines, and those are still checked for grounding |
| **Id patterns** (Q5, Q6) | Live in the catalog's property schemas: `recordId`, `scanId`, `eventRef` exactly as in `workbench/schema/` (full scan ids). The checks after the schema (ids resolve, path × type, phase, limits, duplicates) still run; the drop codes in `examples/invalid/EXPECTED.json` still apply |
| **Short scan ids on screen** (Q6) | A formatting rule in our renderer (`shortScanId`), never text the agent writes |
| **Provenance frame** (D-40): generated mark, Why, source line, feedback | Server-owned: the client wraps each agent surface in `.sy-genview` and adds Why and feedback. The agent can't omit or fake them |
| **Frame ids `t{turn}-{id}`** | One surface per turn for inline cards (ids unique per surface), or one stage surface with stable component ids that a later turn updates in place |
| **Writes through command cards** (D-41) | A2UI button actions arrive as user actions on the server, which proposes a command card. No action calls an API directly |
| **Phase and path rules, limits** | Enforced on the server before anything reaches `surfaceUpdate`, as today |
| **Classes and markup** (`genui.css`, `salvage.css`) | Unchanged: the renderer's component implementations use the same classes |

**What to ask of the A2UI design before switching:** where the catalog definition lives (generate it from
`gen_wb_schema.py` so the patterns have one source), and how the server filters agent messages (data-model writes to
observed paths, unknown components) before the client sees them.
