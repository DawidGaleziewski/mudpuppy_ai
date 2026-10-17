# PROC-001 EARS statements

> **MOCK** for rating (spec 034, R-68). Made-up data.

[README](README.md) · [Steps](PROCESS_STEPS.md) · [Business](BUSINESS_REQUIREMENTS.md) ·
[Functional](FUNCTIONAL_REQUIREMENTS.md) · EARS · [Contracts](CONTRACTS.md) · [Gaps](GAPS.md)

Each requirement, NFR and rule as one EARS statement (Easy Approach to Requirements Syntax). The BA
agent wrote these while documenting; this file only prints them. Patterns: **Ubiquitous** (The
<system> shall …), **Event** (When …), **State** (While …), **Unwanted** (If … then …),
**Optional** (Where …), **Complex** (combinations).

| Key | Pattern | EARS statement | Source |
|---|---|---|---|
| REQ-001 | Event | When the guest presses "Dalej" on step 1, the travel calculator shall check that "Data powrotu" is after "Data wyjazdu" and at most 180 days later. | REQ-001, BR-001 |
| REQ-001 | Unwanted | If a trip date is empty when the guest presses "Dalej", then the travel calculator shall show "Uzupełnij daty podróży" under the empty field and stay on step 1. | REQ-001 |
| REQ-002 | Event | When the guest presses "Pokaż oferty", the travel calculator shall request a quote for the trip and travellers and show its three variants. | REQ-002 |
| REQ-002 | Unwanted | If the quote request fails, then the travel calculator shall show "Nie udało się obliczyć ceny. Spróbuj ponownie." and keep the travellers. | REQ-002 |
| REQ-003 | Ubiquitous | The offer page shall show the variants Basic, Standard and Premium with their sums insured and prices. | REQ-003 |
| REQ-004 | Event | When the guest presses "Kupuję", the portal shall register an application and show its number. | REQ-004 |
| BR-003 | Unwanted | If a traveller's age is outside 0 … 99, then the travel calculator shall show "Wiek musi być liczbą od 0 do 99". | BR-003 |
| BR-004 | State | While 9 travellers are listed, the travel calculator shall disable "+ Dodaj podróżnego". | BR-004 |
| BR-005 | Optional | Where the winter sports cover is chosen, the offer page shall multiply the variant's price by 1.5. | BR-005 (inferred) |
| BR-006 | Complex | While a quote is older than 30 minutes, when the guest opens its offer page, the portal shall show "Oferta wygasła. Oblicz cenę ponownie." | BR-006 (**needs confirmation**) |
| NFR-001 | Ubiquitous | The quote service shall answer within 3 seconds. | NFR-001 (draft) |
| NFR-002 | Event | When a field error shows, the portal shall announce it to assistive technology and link it to its field. | NFR-002 |

Missing EARS form: `REQ-005` (draft; the BA did not write one yet).
