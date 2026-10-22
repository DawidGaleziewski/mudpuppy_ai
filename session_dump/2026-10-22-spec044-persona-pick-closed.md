# Spec 044 (v2.3.1) — closed 2026-10-22

**State:** squash-merged on master as d642703, master pushed; tag `v2.3.1` created (its push was
slow over SSH, check `git ls-remote --tags origin v2.3.1`); feature branch deleted after the tag
push. Running: dashboard (`MUDPUPPY_WORKBENCH=1`, 8765), chat service (`MUDPUPPY_ENV=local-dev`,
4310), proving ground (4100) — started from this session; stop them by their own PIDs.

## What 2.3.1 holds

- **Persona on the Workbench's Start card** (F-18): "As" lists the portal's personas (newest
  scan's, else guest, else first); Confirm sends it; a refused scan names what it misses; no
  persona → link to Settings. Chat `workbench-commands` + `workbench-persona`, dashboard
  `wb_render._persona_choice`. Owner's hand try started scan `01a16518` with it.
- **local-dev store**: `portals/*-local` (11 copies of the local test portals, environment
  `local-dev`) with `personas/*-local`; the 7 logged-in personas' logins in the local-dev vault
  (proving ground: generated with `--seed-brand`, the seed file rewritten; scar-maker: the fixture
  login). `.mcp.json` and CLAUDE.md's chat start use `local-dev`; originals, gates, tests stay on
  `sandbox`.

## Owner decisions this session

- **D-1…D-10 reviewed** (questionnaire page https://claude.ai/artifact/XSqXgCs2s7vVTuWgnUnZWd;
  recorded in spec 043 § "Owner review"): D-1–D-4, D-7 accepted; D-5, D-8, D-10 → R-96; D-6
  (commands only on switched-on environments; on for local-dev + sandbox) and D-9 (full scan ids)
  + F-18 (b) (header lists only the store's portals) → R-94 (8).
- **D-1 note:** no API key at work; stay on the Claude Code CLI login, agent-neutral (easy switch
  to e.g. Kiro), "we don't own the agent loop" → R-96 keeps ACP, no Claude Agent SDK.
- **R-96 Workbench 2:** React; A2UI drawn by `@a2ui/react` with our own components; no
  CopilotKit (paid/closed); open AG-UI packages where they fit; live shared state over
  **WebSockets**; crawler/BA in the background so the agent never blocks. Whole dashboard to
  React ("htmx … is sluggish"). Spike first, designer after the spike.
- **R-95:** add a persona from the Workbench (needs the designer's component).
- **Order:** close 2.0 first (R-89, R-88, R-32), then the UI (R-96 with R-94 (8)).

## Found (spec 043 findings)

- F-18 first scan could not start (fixed); F-19 no live card after Confirm — the assistant runs
  the crawler inside its turn and waits for the whole scan (root cause of the htmx Workbench's
  weakness, R-96); F-20 the Workbench's crawler stopped with 180 links queued, not diagnosed.
- My slips: a shell append to a tracked file (blocked by the hook, redone with Edit); the first
  D-5 analysis missed that the assistant blocks.

## Next

R-89 (BA rules recall bundle): pick the approach (A: server lists "limits with a validation
message and no rule" in pass 7; B: export/eval count them) and set a trial budget (last round
about $9).
