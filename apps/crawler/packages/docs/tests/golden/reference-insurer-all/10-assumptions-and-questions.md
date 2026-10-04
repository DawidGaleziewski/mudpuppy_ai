# 10. Assumptions and open questions

## 10.1 Assumptions

### <a id="ASM-001"></a>ASM-001 — Same calculator for every make

**ASM-001** · rev 1 · draft · inferred

> DRAFT — not confirmed by a reviewer

The calculator steps are the same whatever make is chosen.

**Impact if wrong:** Processes per make would be missing.

Related: answers [OQ-001](#OQ-001)

Evidence:

- form `00000000-0000-7000-8000-000000000006` — form: marka, model, rok_produkcji, pojemnosc (run `00000000-0000-7000-8000-000000000001`, map, 2026-01-15)

## 10.2 Open questions

### <a id="OQ-001"></a>OQ-001 — Does the make change the calculator?

**OQ-001** · rev 1 · draft · needs_confirmation

> DRAFT — not confirmed by a reviewer

Do some makes show extra calculator steps?

**Why it matters:** Decides whether the process has variants.

**Answer needed from:** either

Evidence:

- form `00000000-0000-7000-8000-000000000006` — form: marka, model, rok_produkcji, pojemnosc (run `00000000-0000-7000-8000-000000000001`, map, 2026-01-15)

## 10.3 Open crawler questions

Questions the crawler raised during its runs that are still open.

| Question | Id | Run |
| --- | --- | --- |
| "Dalej" is classified mutating and blocked at the read ceiling. How many calculator steps follow? | `00000000-0000-7000-8000-000000000012` | `00000000-0000-7000-8000-000000000001` |
| What happens after "Kup polisę"? It was refused as mutating. | `00000000-0000-7000-8000-000000000013` | `00000000-0000-7000-8000-000000000001` |
