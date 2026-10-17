# PROC-001 Contracts

[README](README.md) · [Steps](PROCESS_STEPS.md) · [Business](BUSINESS_REQUIREMENTS.md) · [Functional](FUNCTIONAL_REQUIREMENTS.md) · [EARS](EARS.md) · Contracts · [Gaps](GAPS.md)

Which APIs the process calls, what each step sends and gets back, per attempt. Machine-readable: [openapi.yaml](openapi.yaml), built from the recorded shapes.

## Signal and noise

Kept here: **2 endpoints, 3 calls**. Left out as noise: 4 static files, 4 analytics calls.

## By step

| Step | Trigger | Call | Statuses |
| --- | --- | --- | --- |
| 4 | OC + Autocasco (AC) | `GET /api/wartosc-pojazdu` | 200 |
| 5 | Kup polisę | `POST /kalkulator/zakup` | 200 |

## GET /api/wartosc-pojazdu

Host `127.0.0.1:4010` · called from step 4 · 200 ×1

**Response** (shape)

```json
{
  "marka": "string",
  "typowa": "integer",
  "typowa_tekst": "string"
}
```

### Attempts

| # | Scan | Sent by | Status | When |
| --- | --- | --- | --- | --- |
| 1 | `01a14b1a-1be6-7000-922f-1c6f3ac81d4e` | OC + Autocasco (AC) | 200 | 2026-10-17T18:23:26 |

Sample (attempt 1, recorded outside production):

```text
response: {"marka":"toyota","typowa":47800,"typowa_tekst":"47 800,00 zł"}
```

## POST /kalkulator/zakup

Host `127.0.0.1:4010` · called from step 5 · 200 ×2

**Request** (shape)

```json
{
  "content_type": "application/x-www-form-urlencoded",
  "fields": {
    "marka": "string",
    "model": "string",
    "rok_produkcji": "string",
    "pojemnosc": "string",
    "kod_pocztowy": "string",
    "data_urodzenia": "string",
    "rok_prawa_jazdy": "string",
    "lata_bezszkodowe": "string",
    "zgoda_dane": "string",
    "zgoda_owu": "string",
    "zakres": "string",
    "kod_rabatowy": "string"
  }
}
```

**Response** (shape)

```json
{
  "kind": "document"
}
```

### Attempts

| # | Scan | Sent by | Status | When |
| --- | --- | --- | --- | --- |
| 1 | `01a148dd-2f17-7000-ae2a-4e1aba488607` | Kup polisę | 200 | 2026-10-17T07:58:25 |
| 2 | `01a14a98-bbba-7000-8a57-9bdeb4de5186` | Kup polisę | 200 | 2026-10-17T16:02:03 |

## Logic seen on the client (pseudo-code)

What the page checks before it moves on, from the recorded form fields; not from source code.

```text
on step 2 (Kalkulator OC/AC — dane pojazdu | Towarzystwo Ubezpieczeń Wzorcowych) submit:
    require "Marka", "Model", "Rok produkcji", "Pojemność silnika (cm³)", "Kod pocztowy"
    check "Marka": “Please select an item in the list.”
    check "Model": maxlength 40; “Please fill out this field.”
    check "Rok produkcji": min 1990; max 2026; “Please fill out this field.”
    check "Pojemność silnika (cm³)": min 50; max 8000; “Please fill out this field.”
    check "Kod pocztowy": pattern [0-9]{2}-[0-9]{3}; “Please fill out this field.”
on step 3 (Kalkulator OC/AC — dane kierowcy | Towarzystwo Ubezpieczeń Wzorcowych) submit:
    require "Data urodzenia", "Rok uzyskania prawa jazdy", "Lata bezszkodowej jazdy", "Zgoda na przetwarzanie danych osobowych", "Oświadczam, że zapoznałem się z OWU"
    check "Data urodzenia": min 1950-01-16; max 2008-01-15; “Please fill out this field.”
    check "Rok uzyskania prawa jazdy": min 1968; max 2026; “Please fill out this field.”
    check "Lata bezszkodowej jazdy": min 0; max 60; “Please fill out this field.”
    check "Zgoda na przetwarzanie danych osobowych": “Please check this box if you want to proceed.”
    check "Oświadczam, że zapoznałem się z OWU": “Please check this box if you want to proceed.”
on step 4 (Kalkulator OC/AC — opcje | Towarzystwo Ubezpieczeń Wzorcowych) submit:
    require "Tylko OC", "Wartość pojazdu (zł)"
    check "Kod rabatowy": maxlength 12; pattern [A-Z]+[0-9]{2}
    check "Wartość pojazdu (zł)": min 5000; max 500000; “Please fill out this field.”
```
