# Spec 079: React leftovers that can be built now (R-106, R-102, R-104, R-94, R-96)

**Branch:** `feature/079-react-leftovers` · **Source:** roadmap R-106 leftovers (2)–(9), R-102 (5),
R-104 (1) (the part the designer has answered), R-94 (5), the stale R-96 labels; the owner,
2026-10-25: "react related ones: do everything that is a green check. Leave rest for now." The
2.0 leftovers are on their own branch (spec 080).

## Why

The owner reviewed spec 078's defaults (D-2, D-4, D-6 changed) and the round-4 leftovers are
ready; the designer's answers that unblock R-102 (5) and R-104 (1) (the live components and the
persona card, `docs/16-genui-components.md`, `docs/19-console-answers/`) and R-94 (5) (the
reference app, `docs/design/salvage-yard/workbench/reference/`) have arrived.

## What this builds

- **FR-001 R-106 (2), D-2: a thumbnail per picture.** The dashboard serves a 192 × 120 WebP of a
  recorded screenshot at `/evidence/{ref}/thumb`, made once with Pillow and cached on disk next to
  the store's evidence (content addressed, so never stale); a list's row picture loads it, the
  picture dialog keeps the full recording. A wireframe (SVG) has no thumbnail: the row shows the
  SVG itself, as today.
- **FR-002 R-106 (3), D-4: Start again re-runs the confirmed command.** Confirm stores the person's
  persona choice on the command row (in `args_json`, the args as confirmed). On a failed start card,
  Start again asks the chat service to copy that row (command, args, reason; source `button`; the
  new row names the failed one), re-check its preconditions and run it confirmed by the same
  person, one click; the new card links to the failed one. A Storybook story for "Didn't start"
  with Start again.
- **FR-003 R-106 (4), D-6 (a): Add to process lists the processes of the personas that saw the
  screen.** The loose screens' menu targets come per persona whose scans recorded the screen,
  grouped per persona when more than one; the default persona only when no scan names one.
- **FR-004 R-106 (5), spec 078 F-01: the absorbed process's record says "merged into".** After a
  merge, the absorbed process's PROC documentation record gets a review comment "Merged into
  {key} {name} … revise or withdraw this record" (a person's only write to a record; the BA's next
  session gets it as pending feedback); Split back adds "the merge note above no longer applies".
  The merge dialog's plan names the record (D-4).
- **FR-005 R-106 (6), F-05 and R-104 (1): the live Workbench's components in the designer's look.**
  The live Workbench's catalog components follow `16-genui-components.md` (the beta Workbench's
  design-system parts instead of grey boxes), `Choice` is a catalog component, and a command that
  failed before it created anything shows "Didn't start" with Start again (FR-002) there too.
- **FR-006 R-106 (7): the layout-stability check runs on its own.** `pnpm --dir apps/dashboard
  cls:ci` boots the dashboard on a seeded temp store, builds nothing it does not need, checks
  every console route and exits non-zero over 0.05; the close-out list runs it (there is no
  hosted CI; D-x).
- **FR-007 R-106 (8): Previous / Next on a process's steps and In no process.** A screen opened
  from a process's steps or from In no process carries that list, so its page head pages through
  it (J / K), as from the Screens list.
- **FR-008 R-106 (9), spec 078 F-07: no eval MCP config left in /tmp.** The eval harness's temp MCP
  config is removed when its session ends, test runs included; a test asserts none is left.
- **FR-009 R-102 (5): the vault in the persona card.** The live Workbench's persona card stores a
  new sign-in's values from the card through the vault dialog (values never stored by the
  console or the chat), as Settings does.
- **FR-010 R-94 (5): our Workbench against the designer's reference app.** A side-by-side
  comparison (`reference-compare.md`): what the reference does that ours does not, and the
  reverse; gaps become findings or roadmap leftovers. It also answers R-105 (2) as a proposal for
  the owner.
- **FR-011 the roadmap's stale labels** (R-96's "next", the designer items already answered).

## Not on this branch

R-102 (3) "Changed underneath you" (owner/designer), (6) a Compare frame for variants (designer);
R-104 (2) "change sandbox" and retiring the beta Workbench (owner), (4) golden-prompt evals
(paid), (6) A2UI stage 2 / v1.0 (upstream); R-105 (2) (owner; FR-010 proposes); R-94 (2) (paid).

## Acceptance

Every suite green (web `pnpm check` + build + Storybook build, chat + e2e, dashboard parallel +
perf/serial, crawler fast tier for the harness change); `ui:check` and `cls:ci` on the pages
touched.
