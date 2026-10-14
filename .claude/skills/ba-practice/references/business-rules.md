# Business rules

Types (`rule_type`):
- `constraint` — a limit on data or action: "Liczba uczestników" from 1 to 12.
- `computation` — a derived value: "Kara za przetrzymanie" = days overdue × daily rate.
- `inference` — a conclusion from other facts: a reader with an overdue loan is "not eligible to reserve".
- `action_enabler` — something becomes possible when a condition holds: "Zarezerwuj" enabled only
  after "Akceptuję regulamin" is ticked.

Where to find them in evidence: required/pattern/min/max attributes; disabled controls and their
hints; validation messages in trace steps; breakdowns on result pages; options that disappear;
actions refused by the crawler (these show a boundary, not a rule).

## A field limit is also a rule

A data item's constraints say what the field accepts; a `business_rule` says what the business
allows. When a field's limit carries business meaning (a range of years or amounts, a date that
cannot be in the past, a maximum duration, an ID or code format, "one of these two is needed"),
write both: the constraint on the `data_item`, and a `constraint` rule citing the field's screen
region and stating the limit with its values. Plain input hygiene (a text field's maximum
length, "required" alone) stays on the data item only.

## Name the control by its label

A rule's statement names the control it is about by its exact visible label, quoted verbatim, as
`name_verbatim` does for data items: `"Liczba dni" may not exceed 30.`, not "the duration may not
exceed 30". When the rule comes from a hint or a message, quote that text too and say which
control it belongs to. A reader (and the evaluator) finds the rule from the screen by that label.

## Decision tables

Use when a rule has two or more conditions. Only rows you have evidence for; unknown combinations
become an `open_question`.

```
conditions: ["\"Rodzaj karty\"", "overdue loans"]
actions:    ["\"Zarezerwuj\" available", "loan limit"]
rows: [
  ["\"Karta roczna\"", "0", "yes", "10 books"],
  ["any", ">= 1", "no (hint \"Zwróć zaległe książki, aby rezerwować\")", "—"]
]
```

## Access rules (several personas)

When a portal was scanned with personas that differ by attributes (tariff, contract, flags),
`get_access_matrix` lists, per screen, the elements only some personas see. An access rule is an
`action_enabler` with both sides as evidence: one persona that sees the element and one that does
not (their variant states from the matrix). Name the condition with the attributes the owner wrote
(`list_runs` → `persona_attributes`), as an `inferred` rule when the attributes differ in more than
one key; the reason for the rule goes in an `open_question`. A screen marked only because a persona
"never reached" it is a coverage fact, not yet a rule: ask, do not state it.

## Honest labels

- Visible limit (attribute or message) → `observed`.
- Formula reconstructed from several results → `inferred`, cite each result.
- Why the limit exists → never in the rule; put it in an `open_question`.
- Rules you know exist but cannot see (loan extension limits behind login, fee caps) → `not_observable`
  + OQ; do not write their values.
