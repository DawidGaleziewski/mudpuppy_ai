# PROC-001 Gaps

> **MOCK** for rating (spec 034, R-68). Made-up data.

[README](README.md) · [Steps](PROCESS_STEPS.md) · [Business](BUSINESS_REQUIREMENTS.md) ·
[Functional](FUNCTIONAL_REQUIREMENTS.md) · [EARS](EARS.md) · [Contracts](CONTRACTS.md) · Gaps

What we are unsure about. Ask the business before rebuilding; each gap names what is known and what
the answer would change.

## To ask the business

| Gap | Question | What we saw | Changes |
|---|---|---|---|
| <a id="gap-001"></a>GAP-001 (`OQ-001`) | How long is a quote valid? | Expired after 41 min, valid after 12 min | `BR-006`, the expiry message timing |
| GAP-002 (`OQ-002`) | Why is "Sporty zimowe" hidden for "Sporty ekstremalne"? Included, or not insurable? | The checkbox disappears | `BR-005`, the offer for extreme sports |
| GAP-003 (`OQ-003`) | How is the base price computed (days, age bands, destination)? | 14 prices for 5 inputs; not enough to fit a formula | the pricing service contract |

## Assumptions the BA made

| Key | Assumption | Confidence | Check by |
|---|---|---|---|
| ASM-001 | 2026 in the date limits is "today + 365 days", not a fixed year | inferred | a scan on another day |
| ASM-002 | The 503 on 2026-10-17 was a temporary outage, not a rule | inferred (1 of 7 calls) | Recheck scan |

## Not reached or not observable

- Payment: done by a consultant by phone; nothing in the portal (`REQ-005`, draft).
- The e-mail sent after the application (if any): not observable from the browser.
- Logged-in customers: the process was scanned as `guest` only; whether a customer sees prefilled
  data is unknown.

## Follow-ups for the crawler

| Key | Follow-up | Status |
|---|---|---|
| FUP-001 | Probe "Wiek" at 99 and 100 for the exact bound | open |
| FUP-002 | Recheck step 3 after 30 minutes to confirm `BR-006` | open |
