# PROC-001 EARS statements

[README](README.md) · [Steps](PROCESS_STEPS.md) · [Business](BUSINESS_REQUIREMENTS.md) · [Functional](FUNCTIONAL_REQUIREMENTS.md) · EARS · [Contracts](CONTRACTS.md) · [Gaps](GAPS.md)

Each requirement, rule and NFR as one EARS statement (Easy Approach to Requirements Syntax), as the BA agent wrote it while documenting.

| Key | Pattern | EARS statement | Status |
| --- | --- | --- | --- |
| REQ-004 | event | When the guest selects "Zmień opcje", the calculator shall show "Kalkulator OC/AC — opcje" with the previously chosen "Zakres", "Assistance" and "Kod rabatowy" preselected. | draft, observed |
| BR-001 | unwanted | If "Dalej" is pressed while "Marka", "Model", "Rok produkcji", "Pojemność silnika (cm³)" or "Kod pocztowy" is empty, then the calculator shall stay on "Dane pojazdu" and show "Please fill out this field." ("Please select an item in the list." for "Marka") at that field. | draft, observed |
| BR-003 | unwanted | If "Rok produkcji" is below 1990 or above 2026 when "Dalej" is pressed, then the calculator shall stay on "Dane pojazdu" and show the field's range message ("Value must be greater than or equal to 1990."). | draft, observed |
| BR-007 | unwanted | If "Rok uzyskania prawa jazdy" is empty, below 1968 or above 2026 when "Dalej" is pressed, then the calculator shall stay on "Dane kierowcy" and show the field's message. | draft, observed |
| BR-010 | unwanted | If no option of "Zakres" is selected when "Oblicz składkę" is pressed, then the calculator shall stay on "Opcje" and show "Please select one of these options.". | draft, observed |
| BR-012 | unwanted | If "Kod rabatowy" is not empty and does not match capital letters followed by two digits when "Oblicz składkę" is pressed, then the calculator shall stay on "Opcje" and show "Please match the requested format.". | draft, observed |
| BR-021 | event | When the guest chooses "OC + Autocasco (AC)" in "Zakres", the calculator shall show the required field "Wartość pojazdu (zł)" on the options step. | draft, observed |
| BR-022 | unwanted | If the "Wartość pojazdu (zł)" value is empty, below 5000 or above 500000, then the calculator shall stay on the options step and not calculate the premium. | draft, observed |
| BR-023 | event | When the guest chooses "OC + Autocasco (AC)", the calculator shall show "Typowa wartość dla tego pojazdu" for the vehicle's "Marka" and "Rok produkcji". | draft, inferred |

Without an EARS statement: `REQ-001`, `REQ-002`, `REQ-003`, `BR-002`, `BR-004`, `BR-005`, `BR-006`, `BR-008`, `BR-009`, `BR-011`, `BR-013`, `NFR-001`, `NFR-002`, `NFR-003`.
