# Tasks: spec 079

One commit per group.

- [X] T001 [opus] FR-001 dashboard: `/evidence/{ref}/thumb` (Pillow, WebP 192 × 120, disk cache), row
  pictures send `thumb`; `RowPicture` loads it (tests)
- [X] T010 [opus] FR-002 chat: Confirm stores the persona in `args_json`; `POST
  /workbench/commands/{id}/again` (copy, re-check, run confirmed by the same person); tests
- [X] T011 [sonnet] FR-002 dashboard + web: the again route through the dashboard, the card's Start
  again calls it, the new card's link to the failed one; Storybook "Didn't start"
- [X] T020 [opus] FR-003 Add to process targets per persona that saw the screen (dashboard read model,
  web menu groups); tests
- [X] T030 [opus] FR-004 the absorbed PROC record's "merged into" review comment, and one on Split
  back; the merge plan names the record (D-4)
- [X] T040 [opus] FR-005 + FR-009 the live Workbench's components in the designer's shapes (16 § 4.1,
  4.3, 4.4, 4.14, 4.15: filmstrip, pictures, facts, record tags), "Didn't start" with Start again
  there, the vault dialog in both persona cards (`Choice` stays ours: not in the designer's
  catalog, F-05)
- [X] T050 [sonnet] FR-006 `cls:ci` (seeded temp store, every route); CLAUDE.md close-out list
- [X] T060 [sonnet] FR-007 Previous / Next from a process's steps and In no process
- [X] T070 [haiku] FR-008 the eval harness's temp MCP config removed after test runs, test
- [X] T080 [sonnet] FR-010 `reference-compare.md`
- [X] T090 Close-out (web check 244 + build + Storybook, chat 390 + e2e 8/8, dashboard parallel +
  perf/serial, crawler evals 141 (full `pnpm test` not run: ports shared with spec 080, F-07),
  `cls:ci` 36 / 0 over, `ui:check` 5 pages (Workbench 503: chat service off on purpose),
  code-reviewer 2 fixed 1 deferred; `data/thumbs/` gitignored as a cache): FR-011 roadmap labels, every suite, `ui:check`, `cls:ci`, code-reviewer,
  glossary, changelog, merge
