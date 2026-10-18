# PROC-001 Functional requirements

[README](README.md) · [Steps](PROCESS_STEPS.md) · [Business](BUSINESS_REQUIREMENTS.md) · Functional · [EARS](EARS.md) · [Contracts](CONTRACTS.md) · [Gaps](GAPS.md)

Functional = what the system shall do (requirements) and how well (non-functional requirements). Acceptance criteria as the BA stored them.

## Requirements

| Key | Requirement | Priority | Status |
| --- | --- | --- | --- |
| [REQ-001](#req-001) | Back-office handling of an accepted application | unset | draft |
| [REQ-002](#req-002) | Calculator steps pass all entered data in the URL | unset | draft |
| [REQ-003](#req-003) | "Kup polisę" submits the whole quote and confirms the application | unset | draft |
| [REQ-004](#req-004) | "Zmień opcje" reopens the options with the previous choices | unset | draft |

### <a id="req-001"></a>REQ-001 Back-office handling of an accepted application

draft — **DRAFT**, not confirmed by a reviewer · needs confirmation · not observable

After "Kup polisę" the system shall register the application under a "Numer wniosku" and a consultant shall contact the customer about payment, as the confirmation "Konsultant skontaktuje się z Tobą w sprawie płatności." states. Registration, contact and payment happen outside the portal and were not observed.

- **Given** a guest has a calculated premium on "Twoja składka" **When** the guest presses "Kup polisę" **Then** the page "Wniosek przyjęty" shows a "Numer wniosku" and "Składka do zapłaty" **and** a consultant contacts the customer about payment (not observable)

Evidence:

- doc record What happens after "Kup polisę"?
- state Wniosek przyjęty | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/zakup) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17

### <a id="req-002"></a>REQ-002 Calculator steps pass all entered data in the URL

draft — **DRAFT**, not confirmed by a reviewer · observed

Each calculator step submits its form by GET to its own route with a step marker krok (1 on /kalkulator/pojazd, 2 on /kalkulator/kierowca, 3 on /kalkulator/opcje) plus all data entered so far, and the server answers with an HTTP 303 redirect to the next step's route (/kalkulator/kierowca, /kalkulator/opcje, /kalkulator/wynik) carrying the accumulated fields without krok: 5 fields after step 1 (marka, model, rok_produkcji, pojemnosc, kod_pocztowy), 10 after step 2 (plus data_urodzenia, rok_prawa_jazdy, lata_bezszkodowe, zgoda_dane, zgoda_owu), 13 after step 3 (plus zakres, assistance, kod_rabatowy). The link "Zmień opcje" on the result page carries the same 13 fields back to /kalkulator/opcje.

- **Given** the guest is on "Kalkulator OC/AC — dane pojazdu" with valid data **When** the guest presses "Dalej" **Then** the browser requests /kalkulator/pojazd?krok=1 with the 5 vehicle fields **and** the server redirects with 303 to /kalkulator/kierowca with the 5 fields in the query
- **Given** the guest is on "Kalkulator OC/AC — opcje" **When** the guest presses "Oblicz składkę" **Then** the server redirects with 303 to /kalkulator/wynik with all 13 fields in the query

Evidence:

- edge edge: "Zmień opcje" · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- page visit http://127.0.0.1:4010/kalkulator/kierowca?marka=toyota&model=Testowy&rok_produkcji=2020&pojemnosc=1600&kod_pocztowy=00-950 · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- page visit http://127.0.0.1:4010/kalkulator/opcje?marka=toyota&model=Testowy&rok_produkcji=2020&pojemnosc=1600&kod_pocztowy=00-950&data_urodzenia=1990-01-01&rok_prawa_jazdy=2010&lata_bezszkodowe=6&zgoda_dane=tak&zgoda_owu=tak · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- page visit http://127.0.0.1:4010/kalkulator/wynik?marka=toyota&model=Testowy&rok_produkcji=2020&pojemnosc=1600&kod_pocztowy=00-950&data_urodzenia=1990-01-01&rok_prawa_jazdy=2010&lata_bezszkodowe=6&zgoda_dane=tak&zgoda_owu=tak&zakres=oc_ac&assistance=tak&kod_rabatowy=WIOSNA10 · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17

### <a id="req-003"></a>REQ-003 "Kup polisę" submits the whole quote and confirms the application

draft — **DRAFT**, not confirmed by a reviewer · observed

The button "Kup polisę" in the form "Zakup polisy" shall POST to /kalkulator/zakup (application/x-www-form-urlencoded) the 13 fields marka, model, rok_produkcji, pojemnosc, kod_pocztowy, data_urodzenia, rok_prawa_jazdy, lata_bezszkodowe, zgoda_dane, zgoda_owu, zakres, assistance, kod_rabatowy, and the response (status 200, no redirect) shall be the page "Wniosek przyjęty" with "Dziękujemy. Numer wniosku:" and the number, "Składka do zapłaty:" with the same amount as "Składka łączna", and the link "Wróć na stronę główną".

- **Given** "Twoja składka" shows "Składka łączna" 1 719,00 zł **When** the guest presses "Kup polisę" **Then** "Wniosek przyjęty" is shown with a "Numer wniosku" and "Składka do zapłaty: 1 719,00 zł."

Evidence:

- edge edge: "Kup polisę" · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- network call POST /kalkulator/zakup · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Twoja składka | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/wynik) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- state Wniosek przyjęty | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/zakup) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17

### <a id="req-004"></a>REQ-004 "Zmień opcje" reopens the options with the previous choices

draft — **DRAFT**, not confirmed by a reviewer · observed

The link "Zmień opcje" on "Twoja składka" shall open "Kalkulator OC/AC — opcje" with all data of steps 1 and 2 and the chosen "Zakres", "Assistance" and "Kod rabatowy" in the URL, and the form shall show those choices preselected.

- **Given** a result calculated with "OC + Autocasco (AC)", "Assistance" ticked and "Kod rabatowy" WIOSNA10 **When** the guest selects "Zmień opcje" **Then** "Kalkulator OC/AC — opcje" opens with "OC + Autocasco (AC)" checked, "Assistance" checked and "Kod rabatowy" WIOSNA10

Evidence:

- edge edge: "Zmień opcje" · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — opcje | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/opcje) · scan `01a14a98-bbba-7000-8a57-9bdeb4de5186` · 2026-10-17
- state Kalkulator OC/AC — opcje | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/opcje) · scan `01a14a98-bbba-7000-8a57-9bdeb4de5186` · 2026-10-17

## Non-functional requirements

| Key | Category | Requirement | Measured | Status |
| --- | --- | --- | --- | --- |
| NFR-001 | localisation | All calculator screens are in Polish only (no language switch observed). Money is shown with a space as thousands separator, a comma as decimal separator, two decimals and the suffix "zł" (e.g. "1 719,00 zł"); negative amounts use the minus sign "−" (e.g. "−200,00 zł"); factors use a decimal comma ("1,00"). Dates travel in the URL as YYYY-MM-DD. | — | draft |
| NFR-002 | accessibility | Every field of the forms "Dane pojazdu", "Dane kierowcy" and "Opcje" exposes an accessible name equal to its visible label, the radio buttons are grouped as "Zakres", and the result is a captioned table "Wyliczenie składki rocznej" with row headers. The navigation "Kroki kalkulatora" lists "Pojazd", "Kierowca", "Opcje", "Wynik" as plain list items without marking the current step. Field hints (e.g. "Format NN-NNN, np. 00-950") are plain text next to the field, not exposed as the field's description in the snapshot. | 3 of 3 forms, 13 of 13 fields labelled fields (ARIA snapshots of the four calculator steps in the map run) | draft |
| NFR-003 | security | All quote data, including the driver's "Data urodzenia", "Kod pocztowy" and the consents, is carried in GET query strings between steps (and so ends up in browser history and server logs); only the final "Kup polisę" uses POST. The purchase POST returned status 200 with no console errors. | 3 GET steps with data in the query, 1 POST requests (page visits and the network call of the map run) | draft |
