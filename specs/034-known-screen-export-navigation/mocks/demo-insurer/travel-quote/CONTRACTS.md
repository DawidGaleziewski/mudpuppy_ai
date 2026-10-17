# PROC-001 Contracts

> **MOCK** for rating (spec 034, R-68). Made-up data.

[README](README.md) · [Steps](PROCESS_STEPS.md) · [Business](BUSINESS_REQUIREMENTS.md) ·
[Functional](FUNCTIONAL_REQUIREMENTS.md) · [EARS](EARS.md) · Contracts · [Gaps](GAPS.md)

Which APIs the process calls, what each step sends and gets back, per attempt. Machine-readable:
[openapi.yaml](openapi.yaml) (built from the recorded shapes; examples from the recorded samples).

## Signal and noise

Recorded during this process: **61 requests**. Kept here: **3 endpoints, 11 calls**. Left out as
noise: 34 static files (js, css, fonts, images), 12 analytics (`collect.demo-stats.test`), 4
feature-flag polls (`GET /api/flags`, same answer every time), 1 `favicon.ico`. The full list is
in `process.json` under `network.noise`.

## By step

| Step | Trigger | Call | Status seen | Needed for |
|---|---|---|---|---|
| 1 | page load | `GET /api/countries` | 200 ×4 | the "Kraj docelowy" options |
| 2 | "Pokaż oferty" | `POST /api/quotes` | 200 ×5, 503 ×1, 500 ×1 (probe) | prices of step 3 |
| 3 | add-on ticked | `POST /api/quotes` | 200 ×3 | the new price |
| 3 | "Kupuję" | `POST /api/applications` | 201 ×1 | the application number |

## POST /api/quotes

Host `api.demo-ubezpieczenia.test` · JSON · no auth (cookie `session` sent, not required: a probe
without it got the same answer) · called from steps 2 and 3

**Request** (shape; `?` = optional, seen missing in some calls)

```json
{
  "destination": "string (ISO country code or EUROPE/WORLD)",
  "departure": "string (date YYYY-MM-DD)",
  "return": "string (date YYYY-MM-DD)",
  "tripType": "string (TOURIST | BUSINESS | EXTREME)",
  "travellers": [{ "age": "integer" }],
  "addons?": ["string (LUGGAGE_PLUS | WINTER_SPORTS)"]
}
```

**Response 200**

```json
{
  "quoteId": "string (uuid)",
  "validUntil": "string (date-time)",
  "variants": [
    { "code": "string (BASIC | STANDARD | PREMIUM)", "price": "number", "currency": "string (PLN)",
      "sums": { "medical": "number", "luggage": "number", "liability": "number" } }
  ]
}
```

### Attempts

| # | Scan | What was sent | Status | What came back | Shown to the user |
|---|---|---|---|---|---|
| 1 | `01a2c4…` trace | ES, 2026-11-02 → 2026-11-09, TOURIST, 1 × age 34 | 200 | 3 variants: 48,00 / 79,00 / 129,00 | step 3 |
| 2 | `01a2c4…` trace | same + `WINTER_SPORTS` | 200 | 72,00 / 118,50 / 193,50 | new prices on step 3 |
| 3 | `01a301…` trace | ES, 2 travellers 34, 36 | **503** | `{"error":"PRICING_UNAVAILABLE"}` | step 2 technical state |
| 4 | `01a2c9…` probe `HTTP 500` | same as 1 | **500** (simulated) | — | step 2 technical state |

Sample (attempt 1, recorded in sandbox, masked):

```json
// request
{"destination":"ES","departure":"2026-11-02","return":"2026-11-09","tripType":"TOURIST","travellers":[{"age":34}]}
// response 200
{"quoteId":"6f1c…","validUntil":"2026-10-15T10:42:00Z","variants":[{"code":"BASIC","price":48.0,"currency":"PLN","sums":{"medical":100000,"luggage":1000,"liability":50000}}, "…2 more"]}
```

## GET /api/countries

Host `api.demo-ubezpieczenia.test` · no request body · cached by the browser (`max-age=86400`)

**Response 200**: `[{ "code": "string", "name": "string (Polish)", "region": "string" }]` · 197
items in every call (same list).

## POST /api/applications

**Request**: `{ "quoteId": "string (uuid)", "variant": "string", "addons": ["string"] }`

**Response 201**: `{ "number": "string (TR/2026/NNNNNN)", "status": "string (NEW)" }`

| # | Scan | Sent | Status | Came back |
|---|---|---|---|---|
| 1 | `01a2c4…` trace | quote 6f1c…, STANDARD, [] | 201 | `TR/2026/000123`, NEW |

## Logic seen on the client (pseudo-code)

What the front end does between the user and the APIs, from the recorded behaviour (not from
source code).

```text
on step1.Dalej:
    errors = validate(BR-001, BR-002)          # no request sent
    if errors: show errors under fields; stay
    else: show step 2 (same URL, React state)

on step2.PokazOferty:
    disable button; show spinner
    res = POST /api/quotes {destination, departure, return, tripType, travellers}
    if res.status == 200: go to /podroz/oferta?quote=res.quoteId
    else: show "Nie udało się obliczyć ceny. Spróbuj ponownie."; keep data

on step3.addon toggled:
    res = POST /api/quotes {...same, addons}
    update prices from res.variants

on step3.Kupuje(variant):
    res = POST /api/applications {quoteId, variant, addons}
    go to /podroz/potwierdzenie (shows res.number)
```
