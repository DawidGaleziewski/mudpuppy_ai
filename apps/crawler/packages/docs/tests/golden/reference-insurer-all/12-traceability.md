# 12. Traceability matrix

Each functional requirement, business rule and use case, the records it relates to, the evidence
it cites and the run that evidence came from. One row per evidence link.

| Record | Related records | Evidence | Run |
| --- | --- | --- | --- |
| [REQ-001](05-functional-requirements.md#REQ-001) (confirmed, observed) | enforces [BR-001](06-business-rules.md#BR-001)<br>refines [UC-001](04-processes-and-use-cases.md#UC-001) | form:`00000000-0000-7000-8000-000000000006` — field "Marka" marked required | `00000000-0000-7000-8000-000000000001` (map, 2026-01-15) |
| [REQ-002](05-functional-requirements.md#REQ-002) (draft, needs_confirmation) | — | form:`00000000-0000-7000-8000-000000000007` — hint "Podaj telefon lub e-mail." | `00000000-0000-7000-8000-000000000001` (map, 2026-01-15) |
| [REQ-002](05-functional-requirements.md#REQ-002) (draft, needs_confirmation) | — | form:`00000000-0000-7000-8000-000000000053` (broken) — earlier sighting of the form | `00000000-0000-7000-8000-000000000001` (map, 2026-01-15) |
| [BR-001](06-business-rules.md#BR-001) (draft, inferred) | uses term [GL-001](08-glossary.md#GL-001)<br>[REQ-001](05-functional-requirements.md#REQ-001) enforces this | rule_candidate:`00000000-0000-7000-8000-000000000014` | `00000000-0000-7000-8000-000000000001` (map, 2026-01-15) |
| [BR-002](06-business-rules.md#BR-002) (draft, needs_confirmation) | — | action:`00000000-0000-7000-8000-00000000000a` | `00000000-0000-7000-8000-000000000001` (map, 2026-01-15) |
| [BR-002](06-business-rules.md#BR-002) (draft, needs_confirmation) | — | open_question:`00000000-0000-7000-8000-000000000013` | `00000000-0000-7000-8000-000000000001` (map, 2026-01-15) |
| [UC-001](04-processes-and-use-cases.md#UC-001) (draft, inferred) | describes [PROC-001](04-processes-and-use-cases.md#PROC-001)<br>[REQ-001](05-functional-requirements.md#REQ-001) refines this | process:`00000000-0000-7000-8000-00000000001c` | `00000000-0000-7000-8000-000000000018` (trace, 2026-01-15) |
