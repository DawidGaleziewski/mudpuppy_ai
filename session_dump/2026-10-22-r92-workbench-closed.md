# R-92 Workbench (spec 043) — closed 2026-10-22

**State:** squash-merged on master as 15f89ec, tag `v2.3.0`, both pushed; feature branch deleted.
Nothing of ours running.

## What 2.3.0 holds

The designer's Workbench beta, phases 0 and 1, behind `MUDPUPPY_WORKBENCH=1` (off by default).
Owner answers 2026-10-22: htmx as designed (not the React island the roadmap row named), phases
0 + 1 first. The assistant answers in words and, when a view helps, places catalogue cards (live
filmstrip and meter, ErrorCard, narration, page miniature, records); writes go through command
cards with one Confirm; the crawler starts only with a confirmed card's prompt. Details:
`specs/043-r92-workbench-genui/` (spec D-1…D-10, tasks, findings F-01…F-17, contract).

## For the owner

- Try it: dashboard with `MUDPUPPY_WORKBENCH=1`, chat service running, Workbench tab.
- Review the adaptations D-1…D-10 (spec.md) — the design assumed infrastructure we do not have.
- Not done: a run with the real assistant; the 40 golden prompts live
  (`pnpm --dir apps/chat eval:workbench --live`, about 40 sessions: needs a budget).
- For the designer: record id pattern too narrow (F-06), 8-character scan ids collide (F-05),
  the beta chip's contrast (F-15).
- Phases 2–4 and the rest: roadmap R-94.

## Next

R-94 once the owner reviewed D-1…D-10; or R-89 (approach + trial budget).
