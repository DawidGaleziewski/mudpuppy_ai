# Demo Ubezpieczenia APIs

> **MOCK** for rating (spec 034, R-68). Made-up data.

Every endpoint the portal called during the scans, which processes use it, and what was left out as
noise. Per-process details (what each step sends and gets back, attempts, samples) are in each
process's `CONTRACTS.md`; this page is the index.

## Endpoints

| Endpoint | Host | Auth seen | Calls | Statuses | Used by |
|---|---|---|---|---|---|
| `GET /api/countries` | api.demo-ubezpieczenia.test | none | 9 | 200 | PROC-001 step 1 |
| `POST /api/quotes` | api.demo-ubezpieczenia.test | none (session cookie, not required) | 15 | 200, 500, 503 | PROC-001 steps 2–3 |
| `POST /api/applications` | api.demo-ubezpieczenia.test | none | 2 | 201 | PROC-001 step 3, PROC-002 step 5 |
| `POST /kalkulator/zakup` | demo-ubezpieczenia.test | none (form post) | 3 | 200 | PROC-002 step 5 |
| `GET /api/vehicles/makes` | api.demo-ubezpieczenia.test | none | 6 | 200 | PROC-002 step 1 |
| `GET /api/me` | api.demo-ubezpieczenia.test | bearer token | 22 | 200, 401 | every `customer` screen |
| `GET /api/policies` | api.demo-ubezpieczenia.test | bearer token | 7 | 200 | (no documented process) |
| `POST /api/claims` | api.demo-ubezpieczenia.test | bearer token | 0 (never submitted: production limit) | — | PROC-003 (shape unknown) |
| `POST /auth/token` | sso.demo-ubezpieczenia.test | form post | 4 | 200, 302 | login (transit) |

## Hosts

| Host | What it is | Requests |
|---|---|---|
| demo-ubezpieczenia.test | the portal pages | 1 204 |
| api.demo-ubezpieczenia.test | the portal's JSON API | 68 |
| sso.demo-ubezpieczenia.test | login (SSO) | 31 |
| collect.demo-stats.test | analytics (noise) | 412 |
| cdn.demo-static.test | static files (noise) | 2 980 |

## Left out as noise

Static files, analytics beacons, feature-flag polls with the same answer every time, health checks
(`GET /api/health`), and fonts. 3 423 requests in total; the rule list is in `portal.json`.
