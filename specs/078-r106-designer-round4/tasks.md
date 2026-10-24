# Tasks: spec 078

Order of work as the designer's README (shell → loading → navigation → pictures and sorting → canvases → Workbench →
layout stability). One commit per group.

- [X] T001 FR-001 header: `PortalMenu` + `StoreMenu` as one `.sy-portal--store` group, the store button and its menu,
  `per portal` on All portals; the assistant's status inside Ask; `--sy-header-h` from a `ResizeObserver`
- [X] T002 FR-002 All portals nav: every section, the portal ones disabled with the note; first visit and returning visit
  (D-1: Changes, Review, Settings shut too)
- [X] T010 FR-003 `Loader`, `Skeleton`, `Reserve`, `Busy` with stories; `QueryState` waits 300 ms, shows a skeleton at
  least 300 ms, refetch dims; the Screens list and graph pages give their shapes (D-3, D-7)
- [X] T020 FR-004 `from` carried by every in-app link, `.sy-backlink` in `PageHead`, the parent crumb carrying its list
- [X] T021 FR-005 `Pager` on the Screen page; J / K; replace (a process's steps and In no process: leftover)
- [X] T030 FR-006 `RowPicture` in the Screens list, "no picture" with the reason (D-2)
- [X] T031 FR-007 `PictureBrowser`: steps, variants on Shift, the tick and Add to process when sortable
- [X] T032 FR-008 backend: migration 0051, `POST …/processes/{id}/scope` and `/scope/remove` in the chat service and the
  dashboard, the loose screens' facts and the menu's targets
- [X] T033 FR-008 In no process: grid, ticks, selection bar, Add to process menu, New process panel, Undo; the process
  page's "Not on the observed path yet" (D-5, D-6)
- [X] T034 FR-009 backend: merge (dry run, merge, undo / split back) in the chat service and the dashboard
- [X] T035 FR-009 the merge dialog from the list and the process page; Merged into with Split back (F-01 leftover)
- [X] T040 FR-010 `useCanvas` (transform, engage, wheel, drag, pinch, keys) for Graph and Diagram
- [X] T041 FR-011 full screen dialog for Graph and Diagram
- [X] T042 FR-012 Diagram's theme, frame and opening; the capability map List / Diagram
- [X] T050 FR-013 the didn't-start card, the server-placed live map card's source line and loader (D-4, F-05)
- [X] T060 FR-014 head data lines held, font preload, `cls:check` over the routes (26 measured, worst 0.016)
- [X] T070 Close-out: every suite, `ui:check`, `cls:check`, code-reviewer, roadmap, glossary, changelog, merge
