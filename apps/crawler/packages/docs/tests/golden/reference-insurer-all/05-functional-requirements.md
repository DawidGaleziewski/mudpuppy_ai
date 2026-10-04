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

Related: enforces [BR-001](06-business-rules.md#BR-001) · refines [UC-001](04-processes-and-use-cases.md#UC-001)

Evidence:

- form `00000000-0000-7000-8000-000000000006` — form: marka, model, rok_produkcji, pojemnosc (run `00000000-0000-7000-8000-000000000001`, map, 2026-01-15) — note: field "Marka" marked required

### <a id="REQ-002"></a>REQ-002 — Contact form needs a phone or an e-mail

**REQ-002** · rev 1 · draft · needs_confirmation

> DRAFT — not confirmed by a reviewer

The contact form asks for a phone number or an e-mail address.

**Priority:** unset

**Rationale:** So the insurer can answer. (needs_confirmation)

**Acceptance criteria:**

_No acceptance criteria recorded._

Evidence:

- form `00000000-0000-7000-8000-000000000007` — form: imie, temat, wiadomosc, telefon (run `00000000-0000-7000-8000-000000000001`, map, 2026-01-15) — note: hint "Podaj telefon lub e-mail."
- form `00000000-0000-7000-8000-000000000053` — **broken: the target no longer exists** (run `00000000-0000-7000-8000-000000000001`, map, 2026-01-15) — note: earlier sighting of the form
