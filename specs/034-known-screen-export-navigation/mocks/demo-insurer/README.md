# Demo Ubezpieczenia: portal documentation (as-is)

> **MOCK** for rating (spec 034, R-68). Made-up data shaped like what MudPuppy records. Nothing here
> comes from a real portal.

Exported by MudPuppy from store `sandbox` · portal `demo-insurer` · documentation as of revision
set 2026-10-17 · drafts included and marked **DRAFT**.

## What this portal does

Demo Ubezpieczenia is a public insurance portal. A guest can read product pages, get a premium for
travel and car insurance, and send a purchase application. A logged-in customer (persona
`customer`) also sees their policies and claims. Everything is in Polish; money is shown as
`1 234,56 zł`.

| | |
|---|---|
| Base URL | `https://demo-ubezpieczenia.test` (sandbox) |
| Environments seen | sandbox |
| Personas scanned | `guest` (anonymous), `customer` (login form) |
| Scans | 14 map scans, 6 process traces, 2 probe scans, 2026-10-02 … 2026-10-17 |
| Screens recorded | 41 (12 in a documented process, 29 in none) |
| Front end | server-rendered pages (`/podroz/*`) and one React micro-frontend (`/konto/*`) |
| APIs | 9 endpoints on 2 hosts, see [APIS.md](APIS.md) |

## Processes

| Key | Process | Steps | Persona | Observed | Gaps | Folder |
|---|---|---|---|---|---|---|
| PROC-001 | Wycena ubezpieczenia turystycznego (travel insurance quote) | 4 | guest | full | 3 | [travel-quote/](travel-quote/README.md) |
| PROC-002 | Kalkulator OC/AC (car insurance quote) | 5 | guest | until boundary (payment) | 5 | [car-quote/](car-quote/README.md) |
| PROC-003 | Zgłoszenie szkody (report a claim) | 3 | customer | map only | 7 | [claim-report/](claim-report/README.md) |

Screens in no process (29) are listed at the end of [SCREENS.md](SCREENS.md) so nothing recorded is
lost.

## How to read this export

- One folder per process. Each holds `README.md` (start here), `PROCESS_STEPS.md`,
  `BUSINESS_REQUIREMENTS.md`, `FUNCTIONAL_REQUIREMENTS.md`, `EARS.md`, `CONTRACTS.md`
  (+ `openapi.yaml`), `GAPS.md`, `images/` and `process.json`.
- Shared across processes: [GLOSSARY.md](GLOSSARY.md) (portal terms, verbatim and English) and
  [APIS.md](APIS.md) (every endpoint, which processes call it).
- Record keys (`BR-004`, `REQ-002`, `DI-006` …) are stable; the same key means the same record in
  every file.
- **Confidence**: *observed* = seen in a scan; *inferred* = concluded from what was seen;
  *needs confirmation* = a guess the business must confirm. Every statement ends with its
  evidence line: `scan 01a1… · state 01a1… · 2026-10-14`.
- **Status**: *confirmed* (a person accepted it), *draft* (the BA agent wrote it, nobody reviewed
  it yet).

## For an agent rebuilding this portal

Read `process.json` first: it has every step, field, rule, requirement and API call with ids,
and the paths of the pictures. The Markdown files are the same content for people. Build one
process folder at a time; `GAPS.md` lists what must be asked before building.
