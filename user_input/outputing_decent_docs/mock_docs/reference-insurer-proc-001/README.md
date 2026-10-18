# PROC-001 Kalkulator OC/AC: wycena i zakup polisy samochodowej

Portal `reference-insurer` · environment sandbox · draft · observed **full** · documentation as of 2026-10-17T18:29:53.405Z

README · [Steps](PROCESS_STEPS.md) · [Business](BUSINESS_REQUIREMENTS.md) · [Functional](FUNCTIONAL_REQUIREMENTS.md) · [EARS](EARS.md) · [Contracts](CONTRACTS.md) · [Gaps](GAPS.md)

## What this service does

Guest walks the four calculator steps and submits a purchase application.

|  |  |
| --- | --- |
| Goal | Get the annual car insurance premium and submit an application to buy the policy. |
| Persona | guest (not logged in) |
| Trigger | The guest follows "Oblicz składkę" (menu "Menu główne" on any page, or the product page "Ubezpieczenie samochodu"). |
| Outcome | Steps (one page each): 1 "Kalkulator OC/AC — dane pojazdu" ("Marka", "Model", "Rok produkcji", "Pojemność silnika (cm³)", "Kod pocztowy", "Dalej"); 2 "Kalkulator OC/AC — dane kierowcy" ("Data urodzenia", "Rok uzyskania prawa jazdy", "Lata bezszkodowej jazdy", the two consents, "Dalej"); 3 "Kalkulator OC/AC — opcje" ("Zakres", "Assistance", "Kod rabatowy", "Oblicz składkę"), with variant 3b: when "OC + Autocasco (AC)" is chosen the box "Wartość pojazdu (zł)" appears with "Typowa wartość dla tego pojazdu: …" and must be filled; 4 "Twoja składka" (table "Wyliczenie składki rocznej", "Kup polisę", "Zmień opcje"); 5 "Wniosek przyjęty" showing "Numer wniosku" and "Składka do zapłaty"; a consultant is to contact the customer about payment. The trace (guest) walked steps 1 to 4 with "OC + Autocasco (AC)" and "Wartość pojazdu (zł)" 50000 and did not buy; step 5 is known from the map runs ("Kup polisę" pressed with OC+AC, Assistance and WIOSNA10, and from the "Tylko OC" result). Variants observed across the map runs: "Marka" "Toyota", "Skoda" or "Volkswagen" all lead to step 2; on step 3 "Tylko OC" or "OC + Autocasco (AC)", with or without "Assistance" and "Kod rabatowy", all lead to "Twoja składka" (optional fields may stay empty); "Zmień opcje" returns to step 3 with the previous choices preselected. Each step stays on its page with a validation message when a required field is empty or out of range. Error branches (not steps): when a step's request fails with HTTP 500 the user sees a bare "Internal Server Error" page; when the request is blocked or the browser is offline the user sees an empty page; a slow response still reaches the next step. |
| Steps | 5 |
| Fields | 15 |
| Business rules · requirements · NFRs · open questions | 16 · 4 · 3 · 7 |
| APIs called | 2 |

## The steps at a glance

| # | Step | Route | States |
| --- | --- | --- | --- |
| 1 | [Ubezpieczenia dla Ciebie \\| Towarzystwo Ubezpieczeń Wzorcowych](PROCESS_STEPS.md#step-1) | `/` | happy path, technical (error) |
| 2 | [Kalkulator OC/AC — dane pojazdu \\| Towarzystwo Ubezpieczeń Wzorcowych](PROCESS_STEPS.md#step-2) | `/kalkulator/pojazd` | happy path, technical (error) |
| 3 | [Kalkulator OC/AC — dane kierowcy \\| Towarzystwo Ubezpieczeń Wzorcowych](PROCESS_STEPS.md#step-3) | `/kalkulator/kierowca` | happy path, technical (error) |
| 4 | [Kalkulator OC/AC — opcje \\| Towarzystwo Ubezpieczeń Wzorcowych](PROCESS_STEPS.md#step-4) | `/kalkulator/opcje` | 4a, 4b, technical (error) |
| 5 | [Twoja składka \\| Towarzystwo Ubezpieczeń Wzorcowych](PROCESS_STEPS.md#step-5) | `/kalkulator/wynik` | happy path |
| (6) | [Wniosek przyjęty \\| Towarzystwo Ubezpieczeń Wzorcowych](PROCESS_STEPS.md#step-6) | `/kalkulator/zakup` | happy path |

(n): cited by the documentation, not on the walked path.

## Files

| File | What it holds |
| --- | --- |
| [PROCESS_STEPS.md](PROCESS_STEPS.md) | Every step: its states with pictures, wireframe, fields, rules and requirements, where it goes next |
| [BUSINESS_REQUIREMENTS.md](BUSINESS_REQUIREMENTS.md) | Capability and use-case goals, business rules with decision tables and pseudo-code |
| [FUNCTIONAL_REQUIREMENTS.md](FUNCTIONAL_REQUIREMENTS.md) | Requirements with acceptance criteria, non-functional requirements |
| [EARS.md](EARS.md) | Each requirement, rule and NFR as the EARS statement the BA wrote |
| [CONTRACTS.md](CONTRACTS.md) + [openapi.yaml](openapi.yaml) | APIs per step, what was sent and returned per attempt, OpenAPI |
| [GAPS.md](GAPS.md) | Open questions, assumptions, follow-ups: what to ask before rebuilding |
| `images/` | Screenshots per state, wireframes per step |
| `process.json` | All of the above as data, for agents |

## Scans behind this documentation

| Scan | Mode | Persona | Date |
| --- | --- | --- | --- |
| `01a148dd-2f17-7000-ae2a-4e1aba488607` | map | guest | 2026-10-17 |
| `01a14949-2007-7000-b5ec-022312627061` | map | guest | 2026-10-17 |
| `01a14982-3e84-7000-9c57-a64fb95a2875` | map | guest | 2026-10-17 |
| `01a149a3-e5fc-7000-8106-d2ad95b84f4b` | map | guest | 2026-10-17 |
| `01a14a95-bb54-7000-8f7e-01d0a7edbb9b` | map | guest | 2026-10-17 |
| `01a14a98-bbba-7000-8a57-9bdeb4de5186` | map | guest | 2026-10-17 |
| `01a14b1a-1be6-7000-922f-1c6f3ac81d4e` | trace | guest | 2026-10-17 |
