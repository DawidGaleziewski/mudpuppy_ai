# PROC-001 Functional requirements

> **MOCK** for rating (spec 034, R-68). Made-up data.

[README](README.md) · [Steps](PROCESS_STEPS.md) · [Business](BUSINESS_REQUIREMENTS.md) ·
Functional · [EARS](EARS.md) · [Contracts](CONTRACTS.md) · [Gaps](GAPS.md)

Functional = what the system shall do (requirements) and how well (NFRs). Acceptance criteria are
as the BA stored them.

## Requirements

| Key | Requirement | Step | Priority | Status |
|---|---|---|---|---|
| REQ-001 | Validate trip dates before step 2 | 1 | must | confirmed |
| REQ-002 | Price the trip on "Pokaż oferty" | 2 | must | confirmed |
| REQ-003 | Show three variants with sums insured and prices | 3 | must | confirmed |
| REQ-004 | Register the application and show its number | 4 | must | confirmed |
| REQ-005 | Tell the customer how payment happens | 4 | should | draft |

### REQ-001 Validate trip dates before step 2 · must · confirmed

The system shall check "Data wyjazdu" and "Data powrotu" against `BR-001` and `BR-002` when the
guest presses "Dalej", show the message under the field, and stay on step 1.

- **Given** step 1 with "Data powrotu" before "Data wyjazdu" **When** the guest presses "Dalej"
  **Then** the message "Data powrotu musi być późniejsza niż data wyjazdu" shows under "Data
  powrotu" **And** step 2 does not open.
- **Given** empty dates **When** "Dalej" **Then** "Uzupełnij daty podróży" under both fields.

Evidence: probe outcomes ×5, scan `01a2c9…` · 2026-10-16

### REQ-002 Price the trip on "Pokaż oferty" · must · confirmed

The system shall send the trip and travellers to `POST /api/quotes` and open step 3 with the
returned quote; on an error it shall stay on step 2 with "Nie udało się obliczyć ceny. Spróbuj
ponownie." and keep the entered data.

- **Given** valid travellers **When** "Pokaż oferty" **Then** `/podroz/oferta?quote=<id>` opens
  with three variants.
- **Given** the pricing API fails **When** "Pokaż oferty" **Then** the error message shows and
  the travellers are kept.

### REQ-003 Show three variants · must · confirmed

…(same layout for every requirement: statement, acceptance criteria, evidence)…

### REQ-004 Register the application · must · confirmed

### REQ-005 Tell the customer how payment happens · should · **DRAFT**

## Non-functional requirements

| Key | Category | Requirement | Measured | Status |
|---|---|---|---|---|
| NFR-001 | performance | Pricing answers within 3 s | 1.2 s median, 2.1 s max over 7 calls | draft |
| NFR-002 | accessibility | Field errors are announced (`role="alert"`) and tied to the field | observed on all 6 validation states | confirmed |
| NFR-003 | localisation | Polish only; money `1 234,56 zł`; dates `DD.MM.RRRR` on screen, ISO in the API | observed | confirmed |
