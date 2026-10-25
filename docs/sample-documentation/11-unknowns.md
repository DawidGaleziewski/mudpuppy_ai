# 11. Unknowns

What the documentation does not know: behaviour a crawl cannot observe, statements a person must
confirm, processes cut off at a safety boundary, and runs still to do.

## 11.1 Not observable

- [PROC-001](04-processes-and-use-cases.md#PROC-001) New portal
- [PROC-002](04-processes-and-use-cases.md#PROC-002) Review
- [PROC-003](04-processes-and-use-cases.md#PROC-003) Same screen?
- [PROC-004](04-processes-and-use-cases.md#PROC-004) Plan next scan
- [PROC-005](04-processes-and-use-cases.md#PROC-005) Set a process's stage
- [PROC-006](04-processes-and-use-cases.md#PROC-006) Mark a process model live
- [PROC-007](04-processes-and-use-cases.md#PROC-007) Save an environment
- [PROC-008](04-processes-and-use-cases.md#PROC-008) Ask the assistant

## 11.2 Needs confirmation

- [PROC-001](04-processes-and-use-cases.md#PROC-001) New portal
- [PROC-002](04-processes-and-use-cases.md#PROC-002) Review
- [PROC-003](04-processes-and-use-cases.md#PROC-003) Same screen?
- [PROC-004](04-processes-and-use-cases.md#PROC-004) Plan next scan
- [PROC-005](04-processes-and-use-cases.md#PROC-005) Set a process's stage
- [PROC-006](04-processes-and-use-cases.md#PROC-006) Mark a process model live
- [PROC-007](04-processes-and-use-cases.md#PROC-007) Save an environment
- [PROC-008](04-processes-and-use-cases.md#PROC-008) Ask the assistant
- [ASM-001](10-assumptions-and-questions.md#ASM-001) The scanned console ran on a read-only copy of its store
- [ASM-002](10-assumptions-and-questions.md#ASM-002) The data shown is test data and does not change the console's behaviour
- [OQ-001](10-assumptions-and-questions.md#OQ-001) What do the assistant-backed actions do when the chat service runs?
- [OQ-002](10-assumptions-and-questions.md#OQ-002) What do the console's write actions do?
- [OQ-003](10-assumptions-and-questions.md#OQ-003) Why could the process documentation export not be built?
- [OQ-004](10-assumptions-and-questions.md#OQ-004) Which console pages were not reached?
- [OQ-005](10-assumptions-and-questions.md#OQ-005) Is the remembered-portal redirect intended?
- [OQ-006](10-assumptions-and-questions.md#OQ-006) Why was "Send" disabled on Portal home?
- [OQ-007](10-assumptions-and-questions.md#OQ-007) When is "Save environment" enabled?

## 11.3 Process boundaries

_none_

## 11.4 Follow-up tasks

### <a id="FUP-001"></a>FUP-001 — Trace "New portal" with the chat service running

**FUP-001** · rev 1 · draft · needs_confirmation

> DRAFT — not confirmed by a reviewer

What does the console show after "Save portal" with valid addresses, and where does it lead?

**Suggested run:** trace of process "New portal", goal: Register a new portal with a production address and a crawl limit and see where the console goes after saving. as guest

**Reason:** Unblocks the outcome of PROC-001 and its use case; needs the chat service up (OQ-001) and a writable test store.

**Task status:** open

Related: follows up [OQ-001](10-assumptions-and-questions.md#OQ-001) · follows up [PROC-001](04-processes-and-use-cases.md#PROC-001)

Evidence:

- record [PROC-001](04-processes-and-use-cases.md#PROC-001) — New portal
- state `01a17541-b0b3-7000-b23a-7b9ba885ff54` — MudPuppy (/app/portals/new) (run `01a1753d-a8da-7000-85d2-b19d666d3587`, map, 2026-10-25)

### <a id="FUP-002"></a>FUP-002 — Trace "Review": confirm, reject and comment a record

**FUP-002** · rev 1 · draft · needs_confirmation

> DRAFT — not confirmed by a reviewer

What happens after "Confirm rev <n>", after "Reject rev <n>" with a reason, after "Comment", and after "Confirm 2" / "Reject 2" on a group in Review?

**Suggested run:** trace of process "Review", goal: Open a record from Records to confirm, confirm one, reject one with a reason and comment one, and see the decision recorded. as guest

**Reason:** Unblocks the outcome of PROC-002 and a use case for it; needs a writable test store (OQ-002).

**Task status:** open

Related: follows up [OQ-002](10-assumptions-and-questions.md#OQ-002) · follows up [PROC-002](04-processes-and-use-cases.md#PROC-002)

Evidence:

- record [PROC-002](04-processes-and-use-cases.md#PROC-002) — Review
- state `01a1753f-f23f-7000-9333-d142f8824a10` — MudPuppy (/app/portals/:portal/docs/:key) (run `01a1753d-a8da-7000-85d2-b19d666d3587`, map, 2026-10-25)

### <a id="FUP-003"></a>FUP-003 — Trace "Same screen?": answer and save a pair

**FUP-003** · rev 1 · draft · needs_confirmation

> DRAFT — not confirmed by a reviewer

After choosing an answer and pressing "Save", does the next pair open, and how is the label shown later?

**Suggested run:** trace of process "Same screen?", goal: Answer one pair with "Same screen", one with "Different screens" and skip one, and see what the console shows after each. as guest

**Reason:** Unblocks the outcome of PROC-003; needs a writable test store (OQ-002).

**Task status:** open

Related: follows up [PROC-003](04-processes-and-use-cases.md#PROC-003)

Evidence:

- record [PROC-003](04-processes-and-use-cases.md#PROC-003) — Same screen?
- state `01a17541-107a-7000-8bc5-38e73949e5be` — MudPuppy (/app/portals/reference-insurer-local/same-screen) (run `01a1753d-a8da-7000-85d2-b19d666d3587`, map, 2026-10-25)

### <a id="FUP-004"></a>FUP-004 — Trace "Plan next scan" with marks and the chat service running

**FUP-004** · rev 1 · draft · needs_confirmation

> DRAFT — not confirmed by a reviewer

After marking "Start here" on a scan and pressing "Start scan" on Plan next scan, what does the console show and where does the new scan appear?

**Suggested run:** trace of process "Plan next scan", goal: Mark a start screen, plan a focused scan with depth 1 and start it, then follow it. as guest

**Reason:** Unblocks the outcome of PROC-004; needs the chat service up (OQ-001).

**Task status:** open

Related: follows up [OQ-001](10-assumptions-and-questions.md#OQ-001) · follows up [PROC-004](04-processes-and-use-cases.md#PROC-004)

Evidence:

- record [PROC-004](04-processes-and-use-cases.md#PROC-004) — Plan next scan
- state `01a17540-b6ab-7000-aa4c-46fedc8a36c3` — MudPuppy (/app/portals/reference-insurer-local/scans/plan) (run `01a1753d-a8da-7000-85d2-b19d666d3587`, map, 2026-10-25)

### <a id="FUP-005"></a>FUP-005 — Trace "Set a process's stage"

**FUP-005** · rev 1 · draft · needs_confirmation

> DRAFT — not confirmed by a reviewer

After choosing another "Stage" and pressing "Set stage", or pressing "Mark as-is documented", what does the process page and the Processes list show?

**Suggested run:** trace of process "Set a process's stage", goal: Change a process's stage from Scoped to As-is documented and back, and see the stage in the list and the history. as guest

**Reason:** Unblocks the outcome of PROC-005; needs a writable test store (OQ-002).

**Task status:** open

Related: follows up [PROC-005](04-processes-and-use-cases.md#PROC-005)

Evidence:

- record [PROC-005](04-processes-and-use-cases.md#PROC-005) — Set a process's stage
- state `01a1753e-01fe-7000-91d8-152388d28304` — MudPuppy (/app/portals/:portal/processes/:key) (run `01a1753d-a8da-7000-85d2-b19d666d3587`, map, 2026-10-25)

### <a id="FUP-006"></a>FUP-006 — Trace "Mark a process model live"

**FUP-006** · rev 1 · draft · needs_confirmation

> DRAFT — not confirmed by a reviewer

After "Mark live in sandbox" with a reason, what do "Live now" and "How we know" show, and does the Processes list's "Live" column change?

**Suggested run:** trace of process "Mark a process model live", goal: Mark model A live in sandbox with a reason and see the History table and the Processes list afterwards. as guest

**Reason:** Unblocks the outcome of PROC-006; needs a writable test store (OQ-002).

**Task status:** open

Related: follows up [PROC-006](04-processes-and-use-cases.md#PROC-006)

Evidence:

- record [PROC-006](04-processes-and-use-cases.md#PROC-006) — Mark a process model live
- state `01a1753e-122f-7000-ac31-15f9bbe7957d` — MudPuppy (/app/portals/reference-insurer-local/processes/PRC-001/history) (run `01a1753d-a8da-7000-85d2-b19d666d3587`, map, 2026-10-25)

### <a id="FUP-007"></a>FUP-007 — Trace "Save an environment" with the chat service running

**FUP-007** · rev 1 · draft · needs_confirmation

> DRAFT — not confirmed by a reviewer

With the assistant running, when does "Save environment" become enabled, what happens after saving, and what do "Save the budgets", "Add persona" and "Change the hints" do?

**Suggested run:** trace of process "Save an environment", goal: Save a sandbox address with the limit "only look, never submit" and change one budget, and see the Environments table and Budgets afterwards. as guest

**Reason:** Unblocks the outcome of PROC-007; needs the chat service up (OQ-001).

**Task status:** open

Related: follows up [OQ-001](10-assumptions-and-questions.md#OQ-001) · follows up [PROC-007](04-processes-and-use-cases.md#PROC-007)

Evidence:

- record [PROC-007](04-processes-and-use-cases.md#PROC-007) — Save an environment
- state `01a17540-ecac-7000-9714-39aba77839c5` — MudPuppy (/app/portals/reference-insurer-local/settings) (run `01a1753d-a8da-7000-85d2-b19d666d3587`, map, 2026-10-25)

### <a id="FUP-008"></a>FUP-008 — Trace "Ask the assistant" with the chat service running

**FUP-008** · rev 1 · draft · needs_confirmation

> DRAFT — not confirmed by a reviewer

What does the BA see after sending a message from Portal home and from the Workbench, after a suggestion button, and after confirming a proposed command?

**Suggested run:** trace of process "Ask the assistant", goal: Ask "What changed since the last scan?" on Portal home, then ask the Workbench to start a map scan and confirm it. as guest

**Reason:** Unblocks the outcome of PROC-008 and CAP-010; needs the chat service up (OQ-001).

**Task status:** open

Related: follows up [OQ-001](10-assumptions-and-questions.md#OQ-001) · follows up [PROC-008](04-processes-and-use-cases.md#PROC-008)

Evidence:

- record [PROC-008](04-processes-and-use-cases.md#PROC-008) — Ask the assistant
- state `01a17541-8dad-7000-8cd1-09927b9bdaf7` — MudPuppy (/app/portals/reference-insurer-local/workbench) (run `01a1753d-a8da-7000-85d2-b19d666d3587`, map, 2026-10-25)

### <a id="FUP-009"></a>FUP-009 — Map the console pages the first scan did not reach

**FUP-009** · rev 1 · draft · needs_confirmation

> DRAFT — not confirmed by a reviewer

What do the unreached console pages show (loose screens, live Workbench, scan Robots/Docs/recovery, recorded-state and error pages, Before / after, BA wiki pages, Docs sections, Review tabs, other portals' homes)?

**Suggested run:** map of `http://127.0.0.1:8790/app/portals/reference-insurer-local/processes/loose` as guest

**Reason:** Answers OQ-004 and OQ-003; needs a higher item-page cap and depth, and a hook that resets the remembered portal so the portals list stays reachable (BR-004).

**Task status:** open

Related: follows up [OQ-003](10-assumptions-and-questions.md#OQ-003) · follows up [OQ-004](10-assumptions-and-questions.md#OQ-004)

Evidence:

- record [OQ-004](10-assumptions-and-questions.md#OQ-004) — Which console pages were not reached?
- open question `01a17542-59d7-7001-ba24-01576d0e199a` — Not reached: no rule rows on the Rules list (only 'Run the rule tests'), so no single-rule page there (BR-001/BR-016 reached via Docs/Search); process Compare page not found (no link seen); process Documentation only by guessed URL .../processes/PRC-001/documentation, recorded as nearly empty; item_view_cap 18 stopped further item pages; assistant/chat buttons skipped. (run `01a1753d-a8da-7000-85d2-b19d666d3587`, map, 2026-10-25)

## 11.5 Open questions

See [Assumptions and open questions](10-assumptions-and-questions.md): 7 BA question(s), 0 open crawler question(s).
