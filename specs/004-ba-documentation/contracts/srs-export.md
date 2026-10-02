# Contract: SRS Export (R-16)

`pnpm docs:export <portal> [--env <env>] [--confirmed-only] [--out <dir>]`, default out
`data/exports/<portal>-<env>-srs/` (replaced on each run). Rendered by pure functions in
`@pathfinder/docs` from the store; deterministic: same store + same flags → byte-identical files
(no wall-clock times, stable sort by key, LF line endings, canonical JSON with sorted keys).

Modes: default "all, drafts marked" includes `draft` and `confirmed` latest revisions (rejected and
withdrawn are listed only in the change log); `--confirmed-only` renders the latest **confirmed**
revision of each record and nothing else.

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
| `11-unknowns.md` | Everything `not_observable`, `needs_confirmation`, blocked/open follow-ups |
| `12-traceability.md` | Matrix: REQ/BR/UC → related records → evidence (kind:id, note) → run (id, mode, date) |
| `records.json` | Canonical machine-readable copy: records with the rendered revision, links, relations, review summary |

## Statement format

Every rendered record starts with a line: `**REQ-007** · rev 3 · confirmed · observed` (or `draft`,
`inferred`, `needs_confirmation`, `not observable`), and ends with an evidence list
`Evidence: form 0199…(run 0198…, map, 2026-09-25) — "field `Kod pocztowy` marked required"`.
Draft records in "all" mode carry a `> DRAFT — not confirmed by a reviewer` callout.

No raw evidence files, ARIA snapshots, request bodies or unscrubbed values are copied (FR-054).

## Diagram parity

Mermaid text for the process map, screen navigation and capability map is also produced by the
dashboard. Both implementations are tested against `diagram-fixtures/` (input records JSON →
expected `.mmd`), added with R-15.
