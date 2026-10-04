# 2. Capabilities

```mermaid
flowchart TB
  subgraph CAP_001["CAP-001: Car insurance quote"]
    CAP_001__PROC_001["PROC-001: Calculate a car premium"]
    CAP_001__SCR_001["SCR-001: Car insurance page"]
    CAP_001__SCR_002["SCR-002: Vehicle calculator"]
  end
```

### <a id="CAP-001"></a>CAP-001 — Car insurance quote

**CAP-001** · rev 1 · confirmed · observed

A guest finds car insurance and calculates an OC/AC premium.

**Contains:**

- [PROC-001](04-processes-and-use-cases.md#PROC-001) Calculate a car premium
- [SCR-001](03-screens.md#SCR-001) Car insurance page
- [SCR-002](03-screens.md#SCR-002) Vehicle calculator

Evidence:

- state `00000000-0000-7000-8000-000000000003` — Ubezpieczenie samochodu | Towarzystwo Ubezpieczeń Wzorcowych (/ubezpieczenia/samochod) (run `00000000-0000-7000-8000-000000000001`, map, 2026-01-15)
- state `00000000-0000-7000-8000-000000000004` — Kalkulator OC/AC — dane pojazdu | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/pojazd) (run `00000000-0000-7000-8000-000000000001`, map, 2026-01-15)
