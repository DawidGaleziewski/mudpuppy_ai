# Business rules

Types (`rule_type`):
- `constraint` — a limit on data or action: "Rok produkcji" not earlier than 1990.
- `computation` — a derived value: premium = base × factors, discount for "Bezszkodowa jazda".
- `inference` — a conclusion from other facts: a vehicle older than 15 years is "not eligible for AC".
- `action_enabler` — something becomes possible when a condition holds: "Dalej" enabled only after
  consents are ticked.

Where to find them in evidence: required/pattern/min/max attributes; disabled controls and their
hints; validation messages in trace steps; breakdowns on result pages; options that disappear;
actions refused by the crawler (these show a boundary, not a rule).

## Decision tables

Use when a rule has two or more conditions. Only rows you have evidence for; unknown combinations
become an `open_question`.

```
conditions: ["vehicle age (years)", "\"Bezszkodowa jazda\" (years)"]
actions:    ["\"AC\" option available", "discount"]
rows: [
  ["< 15", ">= 5", "yes", "10%"],
  [">= 15", "any", "no (hint \"AC niedostępne dla pojazdów starszych niż 15 lat\")", "—"]
]
```

## Honest labels

- Visible limit (attribute or message) → `observed`.
- Formula reconstructed from several results → `inferred`, cite each result.
- Why the limit exists → never in the rule; put it in an `open_question`.
- Rules you know exist but cannot see (renewal windows behind login, payout limits) → `not_observable`
  + OQ; do not write their values.
