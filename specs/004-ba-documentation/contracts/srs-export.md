# Contract: SRS Export (R-16)

`pnpm docs:export <portal> [--env <env>] [--confirmed-only] [--out <dir>]`, default out
`data/exports/<portal>-<env>-srs/` (replaced on each run, but only when the folder is missing,
empty, or a previous export holding `records.json` and `README.md`; any other existing folder is
refused with exit 2 and nothing is deleted). Rendered by pure functions in
`@pathfinder/docs` from the store; deterministic: same store + same flags → byte-identical files
(no wall-clock times, stable sort by key, LF line endings, canonical JSON with sorted keys).

Modes: default "all, drafts marked" renders the latest revision of each record when it is `draft`
or `confirmed`. When a newer draft sits on top of a confirmed revision, the draft is rendered with
the DRAFT callout and a line `confirmed baseline: rev N`, as the Docs tab shows it. Records whose
latest revision is `rejected` with no confirmed baseline, and withdrawn records, are not rendered
in the chapters; they are listed only in `appendix-change-log.md`. `--confirmed-only` renders the
latest **confirmed** revision of each record (the baseline when a newer draft exists) and nothing
else; its change log lists only confirmed revisions.

## Files

Outline adapted from ISO/IEC/IEEE 29148 (SRS) for as-is documentation.

| File | Content |
|---|---|
| `README.md` | Title, portal, environment, "as of" (newest revision/review time), mode, counts by kind and status, legend (confidence, status, not observable), chapter index |
| `01-introduction.md` | Purpose (as-is documentation for re-creation), scope = observed portal area, personas, sources (runs read by sessions: id, mode, date, status), definitions → glossary, placeholder "Business goals / stakeholders: not observable" |
| `02-capabilities.md` | Capability map (Mermaid `flowchart`), each `CAP` with contained processes and screens |
| `03-screens.md` | Each `SCR`: purpose, route templates, elements (verbatim labels), data items shown, entry points; navigation diagram (Mermaid `stateDiagram-v2` of screens from edges) |
| `04-processes-and-use-cases.md` | Each `PROC` with its process map (Mermaid `flowchart` from trace steps; boundary drawn as a dashed "not observable" node) and its `UC` specs (Cockburn template) |
| `05-functional-requirements.md` | Each `REQ`: statement, priority, acceptance criteria as Gherkin blocks, refines/enforces links |
| `06-business-rules.md` | Each `BR`: statement, type, decision table (Markdown table) |
| `07-data-dictionary.md` | Each `DI`: verbatim name, English name, type, constraints, where seen; entity diagram (Mermaid `erDiagram`) when data items group into entities |
| `08-glossary.md` | `GL` terms sorted by verbatim term, definitions, synonyms |
| `09-non-functional.md` | `NFR` by category, measured values |
| `10-assumptions-and-questions.md` | `ASM`, `OQ` (BA), open crawler questions |
| `11-unknowns.md` | Everything `not_observable`, `needs_confirmation`, blocked/open follow-ups, and evidence links whose target no longer exists (record key, rev, evidence kind:id) |
| `12-traceability.md` | Matrix: REQ/BR/UC → related records → evidence (kind:id, note) → run (id, mode, date) |
| `appendix-change-log.md` | Per record key: every revision (rev, change, status, created) and its reviews (action, reviewer, time); rejected-only and withdrawn records appear only here |
| `records.json` | Canonical machine-readable copy: records with the rendered revision, links, relations, review summary |

## Statement format

Every rendered record starts with a line: `**REQ-007** · rev 3 · confirmed · observed` (or `draft`,
`inferred`, `needs_confirmation`, `not observable`), and ends with an evidence list
`Evidence: form 0199…(run 0198…, map, 2026-09-25) — "field `Kod pocztowy` marked required"`.
Draft records in "all" mode carry a `> DRAFT — not confirmed by a reviewer` callout.

No raw evidence files, ARIA snapshots, request bodies or unscrubbed values are copied (FR-054).

## Diagram parity

The `erDiagram` in `07-data-dictionary.md` is export-only (no dashboard twin, so no parity test).
Mermaid text for the process map, screen navigation and capability map is also produced by the
dashboard. Both implementations are tested against `diagram-fixtures/` (input records JSON →
expected `.mmd`), added with R-15.
