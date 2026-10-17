# PROC-001 Business requirements

[README](README.md) · [Steps](PROCESS_STEPS.md) · Business · [Functional](FUNCTIONAL_REQUIREMENTS.md) · [EARS](EARS.md) · [Contracts](CONTRACTS.md) · [Gaps](GAPS.md)

Business = what the business wants and the rules it applies: the capability and use-case goals, then every business rule observed on this process.

## Goals

_No capability or use case documented for this process yet._

## Business rules

### <a id="br-001"></a>BR-001 All vehicle fields are required

draft — **DRAFT**, not confirmed by a reviewer · observed

In the form "Dane pojazdu" the fields "Marka", "Model", "Rok produkcji", "Pojemność silnika (cm³)" and "Kod pocztowy" are all required; "Marka" must be changed from "— wybierz —" to one of "Toyota", "Skoda", "Volkswagen", "Fiat", "Inna". The check is the browser's own field constraint: pressing "Dalej" with them empty keeps the guest on the step with "Please select an item in the list." on "Marka" and "Please fill out this field." on the others (observed by the probes, all empty and one at a time). A non-numeric value in "Rok produkcji" or "Pojemność silnika (cm³)" counts as empty. _(constraint)_

Evidence:

- edge edge: "Dalej" · scan `01a149a3-e5fc-7000-8106-d2ad95b84f4b` · 2026-10-17
- form form: marka, model, rok_produkcji, pojemnosc · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — dane pojazdu | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/pojazd) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — dane pojazdu | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/pojazd) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- state Kalkulator OC/AC — dane pojazdu | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/pojazd) · scan `01a149a3-e5fc-7000-8106-d2ad95b84f4b` · 2026-10-17
- state Kalkulator OC/AC — dane pojazdu | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/pojazd) · scan `01a149a3-e5fc-7000-8106-d2ad95b84f4b` · 2026-10-17
- state Kalkulator OC/AC — dane pojazdu | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/pojazd) · scan `01a149a3-e5fc-7000-8106-d2ad95b84f4b` · 2026-10-17

### <a id="br-002"></a>BR-002 "Model" is at most 40 characters

draft — **DRAFT**, not confirmed by a reviewer · observed

The "Model" field accepts at most 40 characters (field maxlength 40). _(constraint)_

Evidence:

- form form: marka, model, rok_produkcji, pojemnosc · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — dane pojazdu | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/pojazd) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17

### <a id="br-003"></a>BR-003 "Rok produkcji" between 1990 and 2026

draft — **DRAFT**, not confirmed by a reviewer · observed

The "Rok produkcji" field accepts a number from 1990 to 2026 (field min 1990, max 2026). A value below 1990 keeps the guest on "Dane pojazdu" with the browser's message "Value must be greater than or equal to 1990." (observed). The upper limit was not probed. Whether 2026 is a fixed value or the current year is not known (OQ-002). _(constraint)_

Evidence:

- edge edge: "Dalej" · scan `01a149a3-e5fc-7000-8106-d2ad95b84f4b` · 2026-10-17
- form form: marka, model, rok_produkcji, pojemnosc · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — dane pojazdu | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/pojazd) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- state Kalkulator OC/AC — dane pojazdu | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/pojazd) · scan `01a149a3-e5fc-7000-8106-d2ad95b84f4b` · 2026-10-17

### <a id="br-004"></a>BR-004 "Pojemność silnika (cm³)" between 50 and 8000

draft — **DRAFT**, not confirmed by a reviewer · observed

The "Pojemność silnika (cm³)" field accepts a number from 50 to 8000 (field min 50, max 8000). _(constraint)_

Evidence:

- form form: marka, model, rok_produkcji, pojemnosc · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — dane pojazdu | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/pojazd) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17

### <a id="br-005"></a>BR-005 "Kod pocztowy" format NN-NNN

draft — **DRAFT**, not confirmed by a reviewer · observed

The "Kod pocztowy" field accepts only two digits, a hyphen and three digits (pattern [0-9]{2}-[0-9]{3}); the hint under the field reads "Format NN-NNN, np. 00-950". _(constraint)_

Evidence:

- form form: marka, model, rok_produkcji, pojemnosc · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — dane pojazdu | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/pojazd) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17

### <a id="br-006"></a>BR-006 Driver must be 18 to 75 years old ("Data urodzenia")

draft — **DRAFT**, not confirmed by a reviewer · observed

The "Data urodzenia" field is a required date limited to 1950-01-16 .. 2008-01-15 (field min and max); the hint under the field reads "Kierowca musi mieć od 18 do 75 lat.". The bounds match an age of 18 to 75 at a reference date of 2026-01-15 (inferred, see OQ-002). _(constraint)_

Evidence:

- form form: data_urodzenia, rok_prawa_jazdy, lata_bezszkodowe, zgoda_dane · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — dane kierowcy | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/kierowca) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17

### <a id="br-007"></a>BR-007 "Rok uzyskania prawa jazdy" between 1968 and 2026

draft — **DRAFT**, not confirmed by a reviewer · observed

The "Rok uzyskania prawa jazdy" field is required and accepts a number from 1968 to 2026 (field min 1968, max 2026). Below 1968 the browser shows "Value must be greater than or equal to 1968.", above 2026 "Value must be less than or equal to 2026.", empty or non-numeric "Please fill out this field."; the guest stays on "Dane kierowcy" (all observed). No check against "Data urodzenia" (e.g. licence before age 18) was observed. _(constraint)_

Evidence:

- edge edge: "Dalej" · scan `01a149a3-e5fc-7000-8106-d2ad95b84f4b` · 2026-10-17
- edge edge: "Dalej" · scan `01a149a3-e5fc-7000-8106-d2ad95b84f4b` · 2026-10-17
- form form: data_urodzenia, rok_prawa_jazdy, lata_bezszkodowe, zgoda_dane · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — dane kierowcy | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/kierowca) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- state Kalkulator OC/AC — dane kierowcy | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/kierowca) · scan `01a149a3-e5fc-7000-8106-d2ad95b84f4b` · 2026-10-17
- state Kalkulator OC/AC — dane kierowcy | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/kierowca) · scan `01a149a3-e5fc-7000-8106-d2ad95b84f4b` · 2026-10-17

### <a id="br-008"></a>BR-008 "Lata bezszkodowej jazdy" between 0 and 60

draft — **DRAFT**, not confirmed by a reviewer · observed

The "Lata bezszkodowej jazdy" field is required and accepts a number from 0 to 60 (field min 0, max 60). _(constraint)_

Evidence:

- form form: data_urodzenia, rok_prawa_jazdy, lata_bezszkodowe, zgoda_dane · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — dane kierowcy | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/kierowca) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17

### <a id="br-009"></a>BR-009 "Dalej" enabled only after both consents

draft — **DRAFT**, not confirmed by a reviewer · observed

On "Kalkulator OC/AC — dane kierowcy" the button "Dalej" is disabled until both checkboxes "Zgoda na przetwarzanie danych osobowych" and "Oświadczam, że zapoznałem się z OWU" are ticked; the page says "Przycisk Dalej jest aktywny po zaznaczeniu obu zgód.". Both checkboxes are also required fields (native message "Please check this box if you want to proceed."). Ticked consents travel on as zgoda_dane=tak and zgoda_owu=tak. _(action enabler)_

| "Zgoda na przetwarzanie danych osobowych" ticked | "Oświadczam, że zapoznałem się z OWU" ticked | "Dalej" enabled |
| --- | --- | --- |
| no | no | no |
| yes | no | no |
| no | yes | no |
| yes | yes | yes |

```text
rule BR-009 ("Dalej" enabled only after both consents):
  if "Zgoda na przetwarzanie danych osobowych" ticked = no and "Oświadczam, że zapoznałem się z OWU" ticked = no:
      "Dalej" enabled: no
  else if "Zgoda na przetwarzanie danych osobowych" ticked = yes and "Oświadczam, że zapoznałem się z OWU" ticked = no:
      "Dalej" enabled: no
  else if "Zgoda na przetwarzanie danych osobowych" ticked = no and "Oświadczam, że zapoznałem się z OWU" ticked = yes:
      "Dalej" enabled: no
  else if "Zgoda na przetwarzanie danych osobowych" ticked = yes and "Oświadczam, że zapoznałem się z OWU" ticked = yes:
      "Dalej" enabled: yes
```

Evidence:

- edge edge: "Dalej" · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- form form: data_urodzenia, rok_prawa_jazdy, lata_bezszkodowe, zgoda_dane · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- page visit http://127.0.0.1:4010/kalkulator/opcje?marka=toyota&model=Testowy&rok_produkcji=2020&pojemnosc=1600&kod_pocztowy=00-950&data_urodzenia=1990-01-01&rok_prawa_jazdy=2010&lata_bezszkodowe=6&zgoda_dane=tak&zgoda_owu=tak · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — dane kierowcy | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/kierowca) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — dane kierowcy | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/kierowca) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — dane kierowcy | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/kierowca) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- state Kalkulator OC/AC — dane kierowcy | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/kierowca) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17

### <a id="br-010"></a>BR-010 "Zakres" is required, default "Tylko OC"

draft — **DRAFT**, not confirmed by a reviewer · observed

In the form "Opcje" the group "Zakres" offers exactly one choice of "Tylko OC" or "OC + Autocasco (AC)"; it is required and "Tylko OC" is selected when the step opens. With no option chosen, "Oblicz składkę" keeps the guest on the step with the browser's "Please select one of these options." (observed). The chosen value travels as zakres (observed oc for "Tylko OC" and oc_ac for "OC + Autocasco (AC)"). "Assistance" (assistance=tak when ticked) and "Kod rabatowy" are optional: leaving both empty is accepted and the result shows "brak" in their rows (observed). _(constraint)_

Evidence:

- edge edge: "Oblicz składkę" · scan `01a149a3-e5fc-7000-8106-d2ad95b84f4b` · 2026-10-17
- edge edge: "Oblicz składkę" · scan `01a149a3-e5fc-7000-8106-d2ad95b84f4b` · 2026-10-17
- form form: zakres, zakres, assistance, kod_rabatowy · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- page visit http://127.0.0.1:4010/kalkulator/wynik?marka=toyota&model=Testowy&rok_produkcji=2020&pojemnosc=1600&kod_pocztowy=00-950&data_urodzenia=1990-01-01&rok_prawa_jazdy=2010&lata_bezszkodowe=6&zgoda_dane=tak&zgoda_owu=tak&zakres=oc_ac&assistance=tak&kod_rabatowy=WIOSNA10 · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — opcje | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/opcje) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — opcje | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/opcje) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- state Twoja składka | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/wynik) · scan `01a149a3-e5fc-7000-8106-d2ad95b84f4b` · 2026-10-17

### <a id="br-011"></a>BR-011 AC only for vehicles younger than 15 years

draft — **DRAFT**, not confirmed by a reviewer · inferred

"OC + Autocasco (AC)" is available only for vehicles younger than 15 years, as the note "AC dostępne tylko dla pojazdów młodszych niż 15 lat." in the group "Zakres" states; the age presumably comes from "Rok produkcji". The note is observed; how the portal enforces it (option disabled, error message, or AC silently dropped) was not observed, because the only vehicle tried was from 2020 (OQ-003). _(constraint)_

Evidence:

- page visit http://127.0.0.1:4010/kalkulator/wynik?marka=toyota&model=Testowy&rok_produkcji=2020&pojemnosc=1600&kod_pocztowy=00-950&data_urodzenia=1990-01-01&rok_prawa_jazdy=2010&lata_bezszkodowe=6&zgoda_dane=tak&zgoda_owu=tak&zakres=oc_ac&assistance=tak&kod_rabatowy=WIOSNA10 · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — opcje | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/opcje) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- state Kalkulator OC/AC — opcje | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/opcje) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17

### <a id="br-012"></a>BR-012 "Kod rabatowy" format: capital letters and two digits

draft — **DRAFT**, not confirmed by a reviewer · observed

The "Kod rabatowy" field is optional, accepts at most 12 characters and only one or more capital letters followed by two digits (pattern [A-Z]+[0-9]{2}); the hint reads "Wielkie litery i dwie cyfry, np. WIOSNA10". A value in another format keeps the guest on "Opcje" with the browser's "Please match the requested format." (observed). When a valid code is used, the result page shows the status "Kod rabatowy WIOSNA10 przyjęty." and a row "Kod rabatowy" with a negative amount (observed −180,00 zł for OC+AC with Assistance, −72,00 zł for "Tylko OC"). Which codes exist and what an unknown code does was not observed (OQ-004). _(constraint)_

Evidence:

- edge edge: "Oblicz składkę" · scan `01a149a3-e5fc-7000-8106-d2ad95b84f4b` · 2026-10-17
- form form: zakres, zakres, assistance, kod_rabatowy · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — opcje | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/opcje) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- state Twoja składka | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/wynik) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- state Twoja składka | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/wynik) · scan `01a14a98-bbba-7000-8a57-9bdeb4de5186` · 2026-10-17
- state Kalkulator OC/AC — opcje | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/opcje) · scan `01a149a3-e5fc-7000-8106-d2ad95b84f4b` · 2026-10-17

### <a id="br-013"></a>BR-013 No-claims discount from 5 years of "Lata bezszkodowej jazdy"

draft — **DRAFT**, not confirmed by a reviewer · inferred

A discount "Zniżka za bezszkodową jazdę" applies when "Lata bezszkodowej jazdy" is 5 or more, as the hint "Od 5 lat bezszkodowej jazdy przysługuje zniżka." states. Observed: with 6 years and "Składka bazowa" 2 000,00 zł the row shows −200,00 zł, i.e. 10% of the base (inferred). Whether the rate grows with more years is not known (OQ-005). _(computation)_

Evidence:

- page visit http://127.0.0.1:4010/kalkulator/wynik?marka=toyota&model=Testowy&rok_produkcji=2020&pojemnosc=1600&kod_pocztowy=00-950&data_urodzenia=1990-01-01&rok_prawa_jazdy=2010&lata_bezszkodowe=6&zgoda_dane=tak&zgoda_owu=tak&zakres=oc_ac&assistance=tak&kod_rabatowy=WIOSNA10 · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Kalkulator OC/AC — dane kierowcy | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/kierowca) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17
- screen region Twoja składka | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/wynik) · scan `01a148dd-2f17-7000-ae2a-4e1aba488607` · 2026-10-17

### <a id="br-021"></a>BR-021 Choosing "OC + Autocasco (AC)" asks for "Wartość pojazdu (zł)"

draft — **DRAFT**, not confirmed by a reviewer · observed

On the options step, when "OC + Autocasco (AC)" is chosen in "Zakres", the form shows the number box "Wartość pojazdu (zł)", which is required; with "Tylko OC" (the default) the box is not shown. The box appears on the same page without navigation (variant 3b of the step). Whether choosing "Tylko OC" again hides the box was not observed. _(action enabler)_

| "Zakres" | "Wartość pojazdu (zł)" shown | "Wartość pojazdu (zł)" required |
| --- | --- | --- |
| "Tylko OC" | no | no |
| "OC + Autocasco (AC)" | yes | yes |

```text
rule BR-021 (Choosing "OC + Autocasco (AC)" asks for "Wartość pojazdu (zł)"):
  if "Zakres" = "Tylko OC":
      "Wartość pojazdu (zł)" shown: no; "Wartość pojazdu (zł)" required: no
  else if "Zakres" = "OC + Autocasco (AC)":
      "Wartość pojazdu (zł)" shown: yes; "Wartość pojazdu (zł)" required: yes
```

Evidence:

- form form: zakres, zakres, assistance, kod_rabatowy · scan `01a14b1a-1be6-7000-922f-1c6f3ac81d4e` · 2026-10-17
- form form: zakres, zakres, wartosc_pojazdu, assistance · scan `01a14b1a-1be6-7000-922f-1c6f3ac81d4e` · 2026-10-17
- process step step 15: Choose OC + Autocasco · scan `01a14b1a-1be6-7000-922f-1c6f3ac81d4e` · 2026-10-17
- screen region Kalkulator OC/AC — opcje | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/opcje) · scan `01a14b1a-1be6-7000-922f-1c6f3ac81d4e` · 2026-10-17
- screen region Kalkulator OC/AC — opcje | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/opcje) · scan `01a14b1a-1be6-7000-922f-1c6f3ac81d4e` · 2026-10-17
- state Kalkulator OC/AC — opcje | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/opcje) · scan `01a14b1a-1be6-7000-922f-1c6f3ac81d4e` · 2026-10-17

### <a id="br-022"></a>BR-022 "Wartość pojazdu (zł)" between 5 000 and 500 000 zł

draft — **DRAFT**, not confirmed by a reviewer · observed

The "Wartość pojazdu (zł)" field accepts a number from 5000 to 500000, as its hint "Wartość rynkowa, od 5 000 do 500 000 zł." says; the limit is the field's own constraint (min 5000, max 500000), so an out-of-range value is refused with the browser's own message. An empty field gives "Please fill out this field.". The message for an out-of-range value was not recorded (not probed). _(constraint)_

Evidence:

- form form: zakres, zakres, wartosc_pojazdu, assistance · scan `01a14b1a-1be6-7000-922f-1c6f3ac81d4e` · 2026-10-17
- process step step 16: Fill vehicle value · scan `01a14b1a-1be6-7000-922f-1c6f3ac81d4e` · 2026-10-17
- screen region Kalkulator OC/AC — opcje | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/opcje) · scan `01a14b1a-1be6-7000-922f-1c6f3ac81d4e` · 2026-10-17

### <a id="br-023"></a>BR-023 Typical vehicle value suggested from "Marka" and "Rok produkcji"

draft — **DRAFT**, not confirmed by a reviewer · inferred

When "OC + Autocasco (AC)" is chosen, the options step requests GET /api/wartosc-pojazdu with the parameters marka and rok_produkcji taken from step 1 and shows the answer under "Wartość pojazdu (zł)" as "Typowa wartość dla tego pojazdu: 47 800,00 zł." (observed for "Toyota" 2020; the answer carries typowa 47800 and typowa_tekst "47 800,00 zł"). The typical value is shown as a hint only; the box is not prefilled (the guest typed 50000). Inferred: that the value depends on make and year comes from the request parameters; how it is computed and whether it limits the entered value is not observed. _(computation)_

Evidence:

- network call GET /api/wartosc-pojazdu · scan `01a14b1a-1be6-7000-922f-1c6f3ac81d4e` · 2026-10-17
- process step step 15: Choose OC + Autocasco · scan `01a14b1a-1be6-7000-922f-1c6f3ac81d4e` · 2026-10-17
- screen region Kalkulator OC/AC — opcje | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/opcje) · scan `01a14b1a-1be6-7000-922f-1c6f3ac81d4e` · 2026-10-17
- state Kalkulator OC/AC — opcje | Towarzystwo Ubezpieczeń Wzorcowych (/kalkulator/opcje) · scan `01a14b1a-1be6-7000-922f-1c6f3ac81d4e` · 2026-10-17
