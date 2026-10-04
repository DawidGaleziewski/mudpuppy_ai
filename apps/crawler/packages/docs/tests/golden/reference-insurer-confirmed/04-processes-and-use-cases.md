# 4. Processes and use cases

## 4.1 Processes

### <a id="PROC-001"></a>PROC-001 — Calculate a car premium

**PROC-001** · rev 1 · confirmed · observed

**Goal:** See an OC/AC premium for a car

**Persona:** guest

**Trigger:** The guest opens "Oblicz składkę".

**Outcome:** The vehicle data form is shown.

**Observed extent:** full

**Process map:**

```mermaid
flowchart TD
  start(["Calculate a car premium"])
  s1["1. navigate: Open the car insurance page"]
  s2["2. click: Open the premium calculator"]
  s3["3. fill: Enter the vehicle model"]
  start --> s1
  s1 --> s2
  s2 --> s3
```

Evidence:

- process `00000000-0000-7000-8000-00000000001c` — Calculate a car premium (run `00000000-0000-7000-8000-000000000018`, trace, 2026-01-15)
- process step `00000000-0000-7000-8000-00000000001e` — step 2: Open the premium calculator (run `00000000-0000-7000-8000-000000000018`, trace, 2026-01-15)

## 4.2 Use cases not linked to a process

_none_
