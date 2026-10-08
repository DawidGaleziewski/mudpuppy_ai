# Guideline review (T012–T013, spec 012)

Rated by the user on 2026-10-07 on the rating page
(https://claude.ai/artifact/MLAqcCCC4guxRR5PQJmezT, `ratings` collection, 32 documents, saved
19:49–19:55 UTC) and confirmed by the same list pasted into the chat.

Result: **32 of 32 accepted as written**, no amendments, no rejections, no notes. The proposals in
`guideline-proposals.md` therefore become `docs/code-guidelines.md` unchanged, and every default
in research R6, R8 and R9 stands.

| Item | Rating | Note |
| --- | --- | --- |
| G-01 file ≤ 400 lines | accept | |
| G-02 function ≤ 80 lines | accept | |
| G-03 complexity ≤ 15, depth ≤ 4 | accept | |
| G-04 ≤ 5 positional params, context object | accept | |
| G-05 one concern per file, no `utils.ts` | accept | |
| G-06 split other large files when touched | accept | |
| G-07 four layers, imports downward | accept | |
| G-08 kernel: no workspace deps, no browser/LLM/DB | accept | |
| G-09 feature schemas in feature model packages | accept | |
| G-10 chat schemas in `@pathfinder/chat-model` | accept | resolves research R6 open point (not `packages/workflow`) |
| G-11 no re-export shims across layers | accept | |
| G-12 folders imported through `index.ts` | accept | |
| G-13 dashboard routers do not import each other | accept | |
| G-14 new MCP tool: thin wrapper + service | accept | |
| G-15 new dashboard page pattern | accept | |
| G-16 new table/column via `db-admin` | accept | |
| G-17 new gate case: `gate()` / `gap()` | accept | |
| G-18 new pipeline step pattern | accept | |
| G-19 comments explain why; spec ids kept | accept | |
| G-20 no dead or commented-out code | accept | |
| G-21 every async call awaited/returned/`void` with reason | accept | |
| G-22 no `any` | accept | |
| G-23 suppressions name the rule and reason | accept | |
| G-24 typed errors at tool/HTTP boundaries | accept | |
| G-25 test tier by kind | accept | |
| G-26 fast-tier test file < 2 s | accept | |
| G-27 tests assert behaviour | accept | |
| G-28 no sleeps in tests; fake secret values | accept | |
| G-29 refactor starts and ends with a behaviour lock | accept | |
| G-30 `CLAUDE.md` per package | accept | |
| G-31 close-out code review | accept | |
| G-32 mutation testing on demand | accept | |
