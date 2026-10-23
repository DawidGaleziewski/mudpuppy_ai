# Q1 · Edges on the recorded map (spec 054)

**Question.** Edge classes for the recorded map: a move off the tree, and a move other scans made. `--retired` and
`--unseen` stand in for now.

**Answered in round 2** (same day): `docs/18-design-answers/10-recorded-map-edges.md`, decision D-52, requirement FE-V18,
demo `design-system/components.html#c-21-edges`. In short:

| Move | Class | Look | Shown |
|---|---|---|---|
| First visit (the tree) | `.sy-edge--tree` | ash, 2 px, solid | always |
| Move off the tree (back to `/`, across) | `.sy-edge--offtree` | control edge, 1 px, solid, **arrowhead** (`marker-end`, `.sy-edge-arrow`); one line per page pair labelled `↩ 3×` / `↩ step 140`; more than six into one page → chip `↩ 14` | layer "Moves off the tree", on |
| A move other scans made, not this one | `.sy-edge--others` | control edge, 1.5 px, long dash `10 6`; pages only they reached are `.sy-node--dim` "Not reached" | layer "Other scans' moves (N)", off |

Lay the graph out with tree edges only, so nothing moves when a back move arrives. Drop `--retired` and `--unseen` from this
map: they mean the portal changed.

## What to change

- [ ] Copy `salvage.css` (round 3 includes round 2) and follow the checklist in `18-design-answers/10-recorded-map-edges.md`.
