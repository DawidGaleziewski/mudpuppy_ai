# 6. Business rules

### <a id="BR-001"></a>BR-001 — Autocasco only for young vehicles

**BR-001** · rev 1 · draft · inferred

> DRAFT — not confirmed by a reviewer

Autocasco (AC) is offered only for vehicles up to 15 years old.

**Type:** constraint

**Decision table:**

| Vehicle age | AC offered |
| --- | --- |
| ≤ 15 years | yes |
| > 15 years | no |

Related: uses term [GL-001](08-glossary.md#GL-001)

Evidence:

- rule candidate `00000000-0000-7000-8000-000000000014` — Autocasco (AC) seems to be offered only for vehicles younger than 15 years. (run `00000000-0000-7000-8000-000000000001`, map, 2026-01-15)

### <a id="BR-002"></a>BR-002 — Purchase issues a policy

**BR-002** · rev 1 · draft · needs_confirmation · not observable

> DRAFT — not confirmed by a reviewer

Selecting "Kup polisę" issues a policy for the calculated premium.

**Type:** action enabler

Evidence:

- action `00000000-0000-7000-8000-00000000000a` — button "Kup polisę" (run `00000000-0000-7000-8000-000000000001`, map, 2026-01-15)
- open question `00000000-0000-7000-8000-000000000013` — What happens after "Kup polisę"? It was refused as mutating. (run `00000000-0000-7000-8000-000000000001`, map, 2026-01-15)
