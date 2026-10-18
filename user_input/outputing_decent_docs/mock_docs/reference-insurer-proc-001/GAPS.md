# PROC-001 Gaps

[README](README.md) · [Steps](PROCESS_STEPS.md) · [Business](BUSINESS_REQUIREMENTS.md) · [Functional](FUNCTIONAL_REQUIREMENTS.md) · [EARS](EARS.md) · [Contracts](CONTRACTS.md) · Gaps

What we are unsure about. Ask the business before rebuilding.

## To ask the business

| Key | Question | Status |
| --- | --- | --- |
| <a id="oq-001"></a>OQ-001 | After the application is accepted ("Wniosek przyjęty"), how is payment taken, when and how does the consultant contact the customer (phone, e-mail; no contact data is asked for in the calculator), when is the policy issued, and how is the "Numer wniosku" (seen as RP/2026/0001) numbered? | draft |
| <a id="oq-002"></a>OQ-002 | The limits "Rok produkcji" max 2026, "Rok uzyskania prawa jazdy" max 2026 and "Data urodzenia" from 1950-01-16 to 2008-01-15 look derived from a reference date of 2026-01-15 (age 18 to 75). Are they computed from the current date on each visit, or fixed? And does the server check them again, or only the browser? | draft |
| <a id="oq-003"></a>OQ-003 | When the vehicle in "Rok produkcji" is 15 years old or older, what does the portal do with "OC + Autocasco (AC)": is the option disabled, is an error shown after "Oblicz składkę", or is AC dropped from the premium? Is the age counted from the year only? | draft |
| <a id="oq-004"></a>OQ-004 | Which values of "Kod rabatowy" are valid, what discount does each give (WIOSNA10 gave −180,00 zł, which looks like 10%), can a code expire, and what does the result page show for a code that matches the format but is unknown? | draft |
| <a id="oq-005"></a>OQ-005 | Which driver ages and engine capacities give which values of "Współczynnik wieku" and "Współczynnik silnika" (only 1,00 was seen, for a 36-year-old driver and 1600 cm³)? Is the no-claims discount a flat 10% from 5 years, or does it grow? Does "Kod pocztowy" or "Marka" affect the premium? What is the rounding rule? | draft |
| <a id="oq-008"></a>OQ-008 | With "OC + Autocasco (AC)" and "Wartość pojazdu (zł)" 50000 the trace reached "Twoja składka", but the amounts it showed were not kept apart from an earlier recording of that page. What does the table "Wyliczenie składki rocznej" show for AC with a vehicle value, and how does the value enter "Składka bazowa" (earlier, AC without a value gave 2 000,00 zł)? | draft |
| <a id="oq-009"></a>OQ-009 | The first map run submitted the options step with "OC + Autocasco (AC)" and no vehicle value (zakres=oc_ac without wartosc_pojazdu) and got a result ("Składka łączna" 1 719,00 zł); the later trace shows a required "Wartość pojazdu (zł)" box after choosing AC. Was the box added to the portal between the scans, or does the server accept an AC quote without a vehicle value (for example from a hand-made URL)? | draft |

## Assumptions the BA made

| Key | Assumption | Confidence |
| --- | --- | --- |
| <a id="asm-002"></a>ASM-002 | The calculator state lives only in the URL query string (REQ-002) and in the final POST; the server keeps nothing between steps, so any step URL with the right parameters can be opened directly and the server recomputes the premium from them. | needs confirmation |

## Not observable

- `REQ-001` Back-office handling of an accepted application

## Follow-ups for the crawler

| Key | Follow-up | Status |
| --- | --- | --- |
| <a id="fup-001"></a>FUP-001 | Trace the OC/AC calculator and purchase | open |
| <a id="fup-002"></a>FUP-002 | Probe the calculator forms for validation and the AC age limit | open |
| <a id="fup-003"></a>FUP-003 | Map the "Opcje" screen reached by "Zmień opcje" | open |
| <a id="fup-007"></a>FUP-007 | Trace and probe the AC quote with "Wartość pojazdu (zł)" | open |
