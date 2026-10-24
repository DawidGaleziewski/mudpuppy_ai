# Findings: spec 078 (R-106, designer round 4)

## Decisions for the owner to review

- **D-1 All portals: Changes, Review and Settings are shut too.** The designer has them live
  across portals with a Portal column (T-12). There is no cross-portal Changes, Review or Settings
  page or API, so on All portals they are disabled with "Pick a portal to open these." like the
  portal sections. Building them is a leftover.
- **D-2 Row pictures use the recording, not a 192 × 120 WebP thumbnail** (T-03 "Image file"). The
  dashboard has no image library; the `<img>` is sized 96 × 60 with `loading="lazy"`, so the
  layout holds, but the full recording is downloaded. A thumbnail endpoint is a leftover.
- **D-3 "Updating" sits under the header's right end, not beside the list's heading** (T-10 Q7.4).
  A loader inserted beside a heading would move the page; the refetch wrapper takes no box
  (`display: contents`), and the note is fixed under the header. The dimmed rows are as designed.
- **D-4 Start again asks the assistant for the same scan** (T-13): a new command card, confirmed as
  every write. The designer has it re-run the same confirmed command; there is no re-run route in
  the chat service yet.
- **D-5 Add to process asks first** (T-05): the designer shows a toast with Undo and no confirm.
  The console's rule is that every write asks first (`ConfirmedWrite`); the answer still offers
  Undo. The merge dialog itself is the confirmation (its primary button names the result).
- **D-6 The Add to process menu uses the portal's default persona** (`guest`): loose screens
  carry no persona, so "Processes · {persona}" lists the default persona's processes. Proposed
  suggestions are not offered as targets (the designer lists them, marked `proposed`).
- **D-7 0–300 ms keeps the old page only for a page's code** (React Router keeps the old page while
  a lazy route loads). Data loads inside the new page, so its body is empty (head drawn) for the
  first 300 ms, then the skeleton. The measured layout shift stays at most 0.016.

### Owner review (2026-10-24)

- **D-1 accepted:** Changes, Review and Settings stay shut on All portals ("as it is greyed out is
  fine"). No cross-portal pages; the leftover is dropped.
- **D-2 changed: build the thumbnails.** The designer's 192 × 120 WebP per screenshot, made once by
  the server (Pillow) and cached on disk; the list loads it instead of the full recording (about
  1 MB for 21 screens on reference-insurer-local, ~48 KB each, measured 2026-10-24).
- **D-3 accepted:** "Updating" stays fixed under the header ("it is good as it is").
- **D-4 changed: Start again re-runs the confirmed command, as the designer drew it**
  ("definetly"). Nothing is lost between sessions (the command is a `workbench_commands` row); a
  chat-service action allowed on a failed start card only copies the row (command, args, the
  persona, which Confirm must now store on the row), re-checks the preconditions, confirms the
  copy for the person and launches it; the new card links to the failed one. A Storybook story
  for "Didn't start".
- **D-5 accepted:** Add to process keeps its confirm, then Undo ("i like your version better").
- **D-6 changed (a), accepted (b)** ("your proposition seems to make sense"): (a) the menu lists
  the processes of the personas whose scans recorded the screen, grouped per persona when more
  than one (the default persona only when no scan names one); (b) suggestions stay out of the
  menu: save one first.
- **D-7 accepted:** the new page's head at once, its body empty for up to 300 ms, then the
  skeleton ("keep it as it is. It looks fine for now"). No route loaders.

## Findings

- **F-01** The merge's "Docs" fact (the absorbed PROC record marked "merged into", Review ▸ Records
  to confirm) is not built: marking a documentation record needs the BA tools. Test idea: merge
  two processes with records; the absorbed record shows in Review. Leftover.
- **F-02** `useCanvas` first cut stored the view in React state per pointer event and read refs
  passed in as parameters; the React Compiler lint refused both (refs during render, memoization
  it cannot keep). The hook now owns its refs and paints the transform itself. Eval idea: none (a
  lint rule holds it).
- **F-03** The CLS check's first version clicked nav links by address; the router adds `?store=`
  once the store follows the portal, so the address changed under it. It clicks by position now.
- **F-04** All portals measured 0.080 on a cold load (the list swapped for the table when the
  overview arrived, the Review plate inserted above Other environments). Fixed: the body waits for
  both reads. Test idea: the CLS check in CI on every route (T-14 asks for it in CI for good).
- **F-05** The live Workbench spike (`features/workbench-live`) does not use "Didn't start" yet;
  only the beta Workbench's command card does. With R-104 (1).
- **F-06** Session slip: an earlier `git commit -am` would have swept any other tracked change; it
  held only the intended test file. Commit by path.
- **F-07** Spec 077's loose end, answered: `/tmp/pf-eval-mcp-*.json` now counts 70, and the newest
  three were written tonight (21:22–21:43), after v2.9.2, while the commit hook ran the crawler's
  fast tier. The cleanup added in v2.9.2 (`process.once('exit')` in
  `apps/crawler/evals/harness/agent.ts`) misses test runs (vitest workers end without it). Spec 077
  F-09's "three" is wrong: about 53 then, 70 now. Test idea: a harness test that asserts no new
  `/tmp/pf-eval-mcp-*` remains after it. Not fixed here (crawler eval harness, out of this branch).

## Leftovers

~~D-1 (cross-portal Changes, Review, Settings)~~ (dropped, owner 2026-10-24), D-2 (thumbnails), D-4 (re-run a confirmed command),
D-6 (a) (the processes of the personas that saw the screen; (b) suggestions as targets dropped), F-01 (docs record of an absorbed
process), F-05; the CLS check in CI; Previous / Next on a process's steps and In no process
(T-02 names them; only the Screens list carries its list today).

## Close-out review: feature/078-r106-designer-round4 (2026-10-24)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | apps/chat/LAYOUT.md:30 | G-30 | new modules `process-scope`, `process-merge` not in the package layout map | added a spec 078 line | small | fixed |
| 2 | apps/dashboard/LAYOUT.md:39 | G-30 | new router `api_process_scope` and read models `queries_process_scope`, `queries_app_process_scope` not in the layout map | added a table row | small | fixed |

Frontend (FA-1…FA-7): no finding. Layers, imports through `index.ts`, no `className`/`style` in pages, no `any` or `@ts-ignore`; the one `eslint-disable` (canvas.ts:318) names its rule and reason; knip 0, jscpd 0 clones. Size and complexity warnings in chat/crawler are all in files outside this branch's changed lines.

Checks after fixes: web `pnpm check` ✓ (typecheck, lint, stylelint, knip, jscpd, 239 tests); chat typecheck ✓ lint ✓ (0 errors) test ✓ (387); dashboard ruff ✓ pytest -n auto ✓; ruff complexity rules: nothing in changed files.
Summary: 2 findings, 2 fixed, 0 deferred, 0 rejected.
