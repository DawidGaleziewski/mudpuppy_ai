# PROC-001 Business requirements

> **MOCK** for rating (spec 034, R-68). Made-up data.

[README](README.md) · [Steps](PROCESS_STEPS.md) · Business · [Functional](FUNCTIONAL_REQUIREMENTS.md)
· [EARS](EARS.md) · [Contracts](CONTRACTS.md) · [Gaps](GAPS.md)

Business = what the business wants and the rules it applies: the capability and use-case goals,
then every business rule observed on this process. How the system does it is in
[FUNCTIONAL_REQUIREMENTS.md](FUNCTIONAL_REQUIREMENTS.md).

## Goals

### CAP-001 Sprzedaż ubezpieczeń online (selling insurance online) · confirmed

Guests can price and apply for insurance products without a consultant; a consultant only
completes payment.

### UC-001 Gość kupuje ubezpieczenie podróży (guest buys travel insurance) · confirmed

| | |
|---|---|
| Primary actor | Guest (not logged in) |
| Preconditions | The guest is on `/podroze` |
| Trigger | "Oblicz cenę" |
| Main flow | 1 Guest enters destination, dates and trip type · 2 Guest adds travellers and their ages · 3 System prices three variants · 4 Guest picks a variant and add-ons · 5 Guest presses "Kupuję" · 6 System registers the application and shows its number |
| Alternate flows | 3a Guest changes data ("Zmień dane") and returns to 1 · 4a Guest ticks an add-on; system re-prices |
| Exception flows | 3b Pricing fails (503): "Spróbuj ponownie", guest stays on 2 · 5a Quote expired (30 min): guest prices again |
| Postconditions | An application exists with a number; a consultant will call within 24 h |

## Business rules

### BR-001 Return date after departure, trip at most 180 days · constraint · confirmed

"Data powrotu" must be later than "Data wyjazdu" and at most 180 days after it.

| Data powrotu − Data wyjazdu | Result |
|---|---|
| ≤ 0 days | refused: "Data powrotu musi być późniejsza niż data wyjazdu" |
| 1 … 180 days | accepted |
| > 180 days | refused: "Podróż może trwać najwyżej 180 dni" |

```text
rule BR-001 (trip dates):
  if return_date <= departure_date:
      reject "Data powrotu musi być późniejsza niż data wyjazdu"
  else if days_between(departure_date, return_date) > 180:
      reject "Podróż może trwać najwyżej 180 dni"
```

Evidence: probe outcomes `boundary` ×3, scan `01a2c9…` · state `01a2ca…` · 2026-10-16

### BR-002 Departure within one year · constraint · **DRAFT** · inferred

The date picker for "Data wyjazdu" allows today … today + 365 days. Not tried beyond (probes
respect the field's max). Evidence: form `01a1f1…` (min/max attributes).

### BR-003 Traveller age 0 … 99 · constraint · confirmed

```text
rule BR-003: for each traveller: require 0 <= age <= 99 else "Wiek musi być liczbą od 0 do 99"
```

### BR-004 At most 9 travellers · constraint · observed

"+ Dodaj podróżnego" is disabled after the 9th traveller row.

### BR-005 Winter sports add-on · computation · inferred (2 observations)

| Wariant | Price without | "Sporty zimowe" ticked | Factor |
|---|---|---|---|
| Basic | 48,00 zł | 72,00 zł | 1.5 |
| Standard | 79,00 zł | 118,50 zł | 1.5 |

```text
rule BR-005: price = base_price(variant, days, ages, destination)
             if addons.winter_sports: price = price * 1.5
             if addons.luggage_plus:  price = price + 39.00
```

Not offered when Rodzaj podróży = "Sporty ekstremalne" (the checkbox is hidden): see `GAP-002`.

### BR-006 A quote is valid for 30 minutes · constraint · **needs confirmation**

Reopening `/podroz/oferta?quote=…` 41 minutes later showed "Oferta wygasła"; reopening after 12
minutes did not. The exact limit is a guess. → [GAPS.md](GAPS.md#gap-001)

### BR-007 Application number format · inference · inferred (1 value)

`TR/<year>/<6-digit sequence>`, e.g. `TR/2026/000123`.
