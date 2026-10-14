# Tasks: frontier order (spec 026, R-35)

Plan: small enough to need none beyond spec.md (one service change, its wiring, a gate, evals).
Model tags per memory `model-split-per-task`.

- [x] T001 [opus] FR-001–FR-005: tiered pick in `mcp-server/src/services/frontier-order.ts` (templates over visited URLs + pending targets, F-01), used by `getNextFrontierItem`; unit tests; golden lock and AS2.3 updated (F-02)
- [x] T002 [opus] SC-001 gate on the proving-ground shop catalogue (G-17); slow tier
- [x] T003 [opus] SC-002 shop, reference and bank evals; findings (F-04 shop cart reached empty → T005; F-05 BA variance; F-06 bank needs the main checkout)
- [x] T005 [opus] F-04 owner decision (a): same-target inference also matches the link's visible name (`same-target.ts`), unit test, gate F-04@026, golden lock; slow tier
- [x] T006 [opus] re-run the shop eval (worktree) and, after the merge, the bank eval from the main checkout; SC-002
- [x] T004 [opus] close-out: code-reviewer, suites, glossary, roadmap, changelog, merge, tag, export
