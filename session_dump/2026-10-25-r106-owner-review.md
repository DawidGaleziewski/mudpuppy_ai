# Session dump 2026-10-25: R-106 closed, owner review of D-1…D-7

On `master` (last commit 885bb91d, the owner's persona). **Uncommitted changes on master** (see
below): move them onto the next branch, do not commit them to master.

## Done

- R-106 (spec 078) closed: crawler `pnpm test:perf` re-run green (the main suite had passed, 308
  files), dashboard `pytest -m 'perf or serial'` green (38); T070 ticked (63f6a059); squash
  `df65253b`, tag v2.10.0, pushed; branch deleted; memory `r106-spec078-state.md` updated.
- The designer's round-4 zip in `user_input/` is the same file already taken in (new mtime only).
  Most "for the designer" items on the roadmap are already answered: recorded-map edge classes
  (round 2, built in `Graph`), the Trace phase bar (round 3, `PhaseBar`), the live components and
  the persona card (`genui-components.html`, docs 16/17, 19/13), the designer's reference app
  (`docs/design/salvage-yard/workbench/reference/`, R-94 (5) unblocked). The roadmap labels are
  stale (R-96 status text still says "next: the htmx pages one by one").
- Owner reviewed D-1…D-7 (recorded in `specs/078-r106-designer-round4/findings.md` § Owner review
  and the R-106 roadmap row): D-1 dropped (All portals stays greyed), D-3, D-5 (keep the confirm),
  D-7 accepted; **to build:** D-2 WebP thumbnails (Pillow, cached), D-4 one-click Start again
  (copy the failed `workbench_commands` row, persona stored on the row at Confirm, re-check
  preconditions, confirm for the person, launch; Storybook story for "Didn't start"), D-6 (a) the
  Add to process menu lists the processes of the personas whose scans recorded the screen.
- The Workbench is always in the nav: `settings.workbench` defaults to True (owner: "i always want
  to see it in nav"); `MUDPUPPY_WORKBENCH=0` hides it. Dashboard ruff + parallel pytest green.

## Uncommitted (on master)

`apps/dashboard/src/mudpuppy_dashboard/settings.py`, `apps/dashboard/CLAUDE.md`,
`docs/glossary/glossary.yaml` + regenerated `README.md` (the Workbench default),
`roadmap.md` (R-106 leftovers), `specs/078-r106-designer-round4/findings.md` (owner review).

## Next (proposed to the owner, not confirmed yet)

One leftovers branch, spec 079, v2.10.1: create the branch first (`git checkout -b`, the changes
follow), commit the above, then build D-2, D-4, D-6 (a); R-106 (5) F-01 "merged into" record,
(6) "Didn't start" in the live Workbench, (7) the CLS check in CI, (8) Previous / Next on process
steps and In no process, (9) F-07 `/tmp/pf-eval-mcp-*.json` leak; R-102 (5) vault dialog in the
persona card; compare with the designer's reference app (R-94 (5)); fix the stale roadmap labels.

## Still the owner's

R-104 (2) "change sandbox" / retire the beta Workbench; R-102 (3) what a 2.0 screen's context is
("Changed underneath you"); rating the frozen rows (R-33, R-36, R-46, R-47, R-48, R-58, R-61,
R-65, R-72, R-78, R-80); budget for paid runs (R-94 (2), R-104 (4), R-97 (3), R-99 (5)).

## Services

None running (dashboard and chat stopped by PID; no orphans).
