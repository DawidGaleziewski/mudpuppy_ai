# 5. Functional requirements

### <a id="REQ-001"></a>REQ-001 — Vehicle make is required

**REQ-001** · rev 1 · confirmed · observed

The calculator requires a vehicle make ("Marka") before "Dalej".

**Priority:** must

**Acceptance criteria:**

```gherkin
Scenario: REQ-001 criterion 1
  Given the form "Dane pojazdu" is shown
  When the guest leaves "Marka" empty
  And selects "Dalej"
  Then the field is marked required
```

Evidence:

- form `00000000-0000-7000-8000-000000000006` — form: marka, model, rok_produkcji, pojemnosc (run `00000000-0000-7000-8000-000000000001`, map, 2026-01-15) — note: field "Marka" marked required
