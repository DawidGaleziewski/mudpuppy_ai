# Demo Ubezpieczenia screens

> **MOCK** for rating (spec 034, R-68). Made-up data.

Every recorded screen, by process. A screen in no process is still listed so nothing is lost.

## In a process (12)

| Screen | Title | Route | Process · step | States |
|---|---|---|---|---|
| SCR-001 | Ubezpieczenie podróży | `/podroze` | PROC-001 · trigger | 1 |
| SCR-002 | Kalkulator ubezpieczenia podróży | `/podroz/kalkulator` | PROC-001 · 1, 2 | 6 (2 form steps, 3 validation, 1 technical) |
| SCR-003 | Wybierz wariant | `/podroz/oferta` | PROC-001 · 3 | 2 |
| SCR-004 | Wniosek przyjęty | `/podroz/potwierdzenie` | PROC-001 · 4 | 1 |
| … | | | | |

## In no process (29)

| Screen | Title | Route | Seen in | Why not in a process |
|---|---|---|---|---|
| — | Kontakt | `/kontakt` | 9 scans | informational page |
| — | Polityka prywatności | `/polityka-prywatnosci` | 9 scans | informational page |
| — | Moje polisy | `/konto/polisy` | 3 scans (`customer`) | no process documented yet (candidate: "view policies") |
| … | | | | |
