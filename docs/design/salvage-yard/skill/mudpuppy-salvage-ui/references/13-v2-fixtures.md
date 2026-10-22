# 13 · MudPuppy 2.0: the data on the screens (fixture)

Every 2.0 screen (`screens/v2-*`) shows the same story, so the screens agree with each other and the story can
become the test fixture (seed the database with it; Playwright baselines then match the designs).

- **Real** (from the v1 scans of 4–6 Oct 2026): the portal, its screens and routes, the persona guest, the three scans,
  the records CAP-005, NFR-001, SCR-001, and the second portal wikipedia.
- **Illustrative** (designed for 2.0): portal parts and releases, the later scans, personas client and premium, changes,
  findings, rules and tests, processes after 6 Oct, cases and paths, Marek (a second BA).

## Data

Real (from v1 scans): portal **reference-insurer** = Towarzystwo Ubezpieczeń Wzorcowych, environment **sandbox**, persona **guest**.
Screens `Ubezpieczenia dla Ciebie` (/), `Samochód` (/ubezpieczenia/samochod), `Dom`, `Podróże`, `Porównanie produktów`,
`Kalkulator OC/AC — dane kierowcy` (/kalkulator/kierowca step 1), `Kalkulator OC/AC — opcje` (same URL, step 2), `Kontakt` (/kontakt),
`FAQ`, `Słowniczek`, `Logowanie` (/logowanie), `Moje polisy` (/moje-polisy). Home's "Na skróty" links: Oblicz składkę OC/AC ·
Porównaj produkty · Przedłuż polisę · Napisz do nas. Menu on every page: Start, Samochód, Dom, Podróże, Porównanie, Oblicz składkę,
Kontakt, FAQ, Słowniczek, Moje polisy, Zaloguj się (11 links). Scans: `01a1083f` (4 Oct 18:48Z, AI scan, completed, 320 steps),
`01a10eb9` (6 Oct 00:59Z, interrupted, 84), `01a110d5` (6 Oct 10:49Z, interrupted 171/400). Records: CAP-005, NFR-001
("Portal content in Polish; field validation uses browser-native messages"), SCR-001 (drafts, rev 1). Second portal: **wikipedia**.

Illustrative 2.0 fixture (everything below). Use it as the seed for tests and demos; the screens use exactly these facts.

**Portal parts and releases** (release marker found in the page code):
- **Shell** (the main site): `1d77` (seen 4 Oct–13 Oct) → `3e1a` (from 14 Oct 08:10Z). Marker: `<meta name="build">`.
- **Kalkulator app** (React app under /kalkulator/): `5f08` (seen from 4 Oct) → `9c21` from 16 Oct 14:02Z, **rollout**: 16 Oct 14:02Z –
  17 Oct 09:30Z both 5f08 and 9c21 were served; 9c21 only since 17 Oct 09:30Z. Marker: footer text "v9c21".
- **Release watch** (how these times are known without a scan): MudPuppy fetches each part's release marker every 30 min (no crawling,
  no AI). It saw `3e1a` first at 14 Oct 08:10Z, `9c21` first at 16 Oct 14:02Z, and `5f08` for the last time at 17 Oct 09:30Z.
  Screens and variants are only seen by scans, so variants of 9c21 are first seen by check run `01a1340c` (17 Oct 10:05Z).
- wikipedia: **no release marker** found → "Changes are detected more slowly: by comparing pages, not releases."

**Scans after v1:** `01a12f40` 15 Oct 07:30Z, AI scan, completed, 388 steps (saw 3e1a + 5f08) · `01a1340c` 17 Oct 10:05Z,
**check run** (replays + rule tests, no AI), 64 checks, 9 findings (saw 3e1a + 9c21). Last scan = 01a1340c. "Now" = 17 Oct 12:00Z.
All times are UTC and written with Z (FE-Q07). **Decided** (Review's history tab): 31 decisions since 4 Oct.

**Personas:** guest (real) · client (logged in) · premium (a premium customer).

**Screens now:** 23 known = **19 active**, **2 merged**, **2 retired**.
- Merged: "Kalkulator OC/AC — dane kierowcy (?src=menu)" → merged into Kalkulator OC/AC — dane kierowcy on 15 Oct
  (automatic grouping: same form, only the query string differs). "Strona główna" → merged into Ubezpieczenia dla Ciebie on 15 Oct
  (your label "same screen", reason "Old title of the home page").
- Retired with 3e1a: "Promocja wakacyjna" (/promocja-lato), "Newsletter" (/newsletter).
- New active screens in 2.0: `Kalkulator OC/AC — wynik` (/kalkulator/wynik), `Nie możemy Cię ubezpieczyć` (/kalkulator/odmowa),
  `Przepraszamy, wystąpił błąd` (error page), `Wiadomość wysłana` (/kontakt/wyslano), `Porównanie produktów` now at /porownanie-2026.
- **Checked** (UI word for screen coverage) = actions checked on the current release, e.g. dane kierowcy 8 / 11, opcje 7 / 7, wynik 5 / 6, Kontakt 4 / 6.
- New in the portal with 3e1a: `Polityka cookies` (/polityka-cookies) — the "New screen" example in Changes (explained automatically: Release 3e1a).

**Screen detail example — Kalkulator OC/AC — dane kierowcy** (/kalkulator/kierowca, step 1, part Kalkulator app):
- Variants: **r1** baseline (5f08, guest, seen 4–15 Oct by scans 01a1083f…01a12f40) · **r2** why **Release 9c21** (first seen 17 Oct 10:05Z by check run 01a1340c; help text now "Musisz mieć ukończone 21 lat";
  "Zapisz kalkulację" button gone) · **r3** why **Persona premium** (extra field "Rabat dla stałych klientów") · **r4** why **Error**
  ("Kod pocztowy" field missing on 1 of 14 visits, 17 Oct 10:12Z, the page logged a script error; explained automatically as a flaky error).
- (The **Unknown** example lives on `Kalkulator OC/AC — opcje`: variant r3 "Assistance 24h: 0 zł" on 2 of 9 visits, no difference found → Needs you.)
- Actions (status · per persona): Dalej (Active) · Wstecz (Active) · "Jak liczymy składkę?" dialog (Active, internal) ·
  Kod pocztowy lookup (Not checked on 9c21) · "Rabat dla stałych klientów" field (Not checked on 9c21 · only premium; persona premium wasn't explored on 9c21) ·
  "Zapisz kalkulację" (Retired with 9c21) · link "Regulamin" (Not seen since 15 Oct).
- History: 6 Oct split — "Kalkulator OC/AC — opcje" became its own screen (a new step on the same URL; automatic) ·
  15 Oct merged — "(?src=menu)" copy merged in (automatic grouping) · Documentation affected: SCR-012, PROC-001.

**Processes** (6):
| Process | Status | Explored | Notes |
|---|---|---|---|
| Oblicz składkę OC/AC | Accepted (you, 6 Oct; edited 15 Oct) | Thorough on 9c21 | PROC-001; 5 screens (3 steps + 2 outcome screens: odmowa, error page); 6 rules BR-021…BR-026 |
| Porównaj produkty | Accepted | Partial on 3e1a | PROC-002; trigger link now goes to /porownanie-2026 |
| Test process | Accepted (yours, migrated scope) | Thorough on 3e1a | PROC-003; / → /faq |
| Napisz do nas | **Proposed** after scan 01a12f40 (no PROC record until accepted) | Partial on 3e1a | trigger "Napisz do nas" on /, "Kontakt" in menu; screens Kontakt → Wiadomość wysłana; outcomes sent, validation, error |
| Przedłuż polisę | **Proposed** | Not explored (needs a credential for persona client) | trigger "Przedłuż polisę" on /; precondition: logged in as client |
| Moje polisy | **Rejected** (you, 15 Oct: "Part of Przedłuż polisę") | — | kept, shown in a collapsed "Rejected (1)" group |

**Process detail — Oblicz składkę OC/AC:**
- Trigger: link "Oblicz składkę OC/AC" in "Na skróty" on Ubezpieczenia dla Ciebie; also "Oblicz składkę" in the menu (every page).
- Preconditions: none (guest). Persona premium sees an extra field (BR-025).
- Screens in order: 1 Kalkulator OC/AC — dane kierowcy → 2 Kalkulator OC/AC — opcje → 3 Kalkulator OC/AC — wynik.
- Outcomes: **Completed** → Kalkulator OC/AC — wynik ("Twoja składka") · **Exited** → Nie możemy Cię ubezpieczyć (age under 21) ·
  **Error** → Przepraszamy, wystąpił błąd (503 once, flaky) · **Abandoned** (left at any step).
- Paths (cases on 9c21): A dane kierowcy → opcje (OC) → wynik: **14** · B dane kierowcy → opcje (OC + AC) → wynik: **9** ·
  C dane kierowcy → odmowa: **6** · D dane kierowcy → opcje → error page: **1**. One case: "Check run 01a1340c, case 7:
  dane kierowcy (age 20) → Nie możemy Cię ubezpieczyć, because age 20 is under 21 (BR-021)."
- Explored on 9c21: "Every action and every pair of actions tried · 50 random walks · nothing new after walk 31" → **Thorough**.
  Missing: "Wartość pojazdu above 500 000 zł not tried"; "Persona premium not explored on 9c21". Explore further: about 12 min.
- Suggestion (you edited this process on 15 Oct, so the system doesn't change it by itself): "Add variant r3 of
  Kalkulator OC/AC — wynik (banner 'Oferta specjalna') as a variant of step 3?" It is **linked** to the A/B test finding and the
  Same screen? conflict: confirming the A/B test settles all three (see "Linked decisions" below); the process page shows it as
  "Decided with the A/B test finding in Review".
- Documentation: PROC-001 (one PROC record per process), rev 3.

**Business rules** (6), all in process Oblicz składkę OC/AC:
| Rule | Where decided | Status | Last tested |
|---|---|---|---|
| BR-021 Driver must be 21 or older | dane kierowcy · "Dalej" | **Changed → needs you** ("threshold moved from 18 to 21 with release 9c21") | 17 Oct, 01a1340c: 20 → exit, 21 → step 2, 22 → step 2: pass |
| BR-022 Zakres is required | opcje · "Dalej" | Confirmed (you, 15 Oct) | 17 Oct: empty → browser message "Zaznacz jedną z tych opcji.": pass |
| BR-023 OC + AC needs the vehicle value | opcje · Zakres | Tested | 17 Oct: OC → no field; OC + AC → "Wartość pojazdu" required: pass |
| BR-024 Price depends on data not visible from the UI | wynik | Proposed | identical visible inputs gave 612 zł and 688 zł; "Decided on data not visible from the UI" |
| BR-025 Premium customers get a discount field | dane kierowcy | Proposed | persona premium only |
| BR-026 Postal code must be NN-NNN | dane kierowcy · "Kod pocztowy" | **Broken** since 9c21 | 17 Oct: "00-950" accepted (ok), "00950" now accepted (was refused on 5f08): fail |
BR-021 decision table: input **Wiek kierowcy** (from "Data urodzenia", on today's date) · rule 1: `< 21` → exit page
"Nie możemy Cię ubezpieczyć" (/kalkulator/odmowa) · rule 2: `≥ 21` → next screen Kalkulator OC/AC — opcje. Previous version
(5f08, replaced): `< 18` → exit; `≥ 18` → opcje. Rerun history: 4 Oct (5f08) 17/18/19 → exit/opcje/opcje pass ·
15 Oct (5f08) same, pass · 17 Oct (9c21) 17/18/19 → exit/exit/exit = **failed against the old table** → threshold search found 21 →
20/21/22 → exit/opcje/opcje (pass on the new table). Shown as a failed test in the history; the rule's status is Changed → Needs you.

**Changes since the previous release** (from: Shell 1d77 / Kalkulator 5f08 → to: Now): **41 changes · 18 need you · 23 explained automatically**.
By group: **Oblicz składkę OC/AC 11** (4 need you: dane kierowcy 6, opcje 2, wynik 3) · **Napisz do nas 2** (1) · **Porównaj produkty 1** (0) ·
**Not in a process 27** (13: Moje polisy link + 12 removed links). Explained automatically by kind: Release 16 · Another persona 1 · Flaky error 2 ·
Replaced 1 · Rollout 1 · Retired 2 (= 23).
Needs you (18):
- BR-021 threshold 18 → 21 (dane kierowcy) — explanation: Release 9c21 — needs you because a rule changed.
- BR-026 broke (dane kierowcy) — "00950 is now accepted".
- "Assistance 24h shows 0 zł on 2 of 9 visits" (opcje) — Unexplained (no difference in release, persona, inputs or cookies).
- "Banner 'Oferta specjalna' on 6 of 11 visits" (wynik) — proposed explanation **A/B test** (cookie `ab_calc` = B), same release and persona.
- "Sending the form always ends on the error page when the phone starts with +48" (Kontakt) — error for one input.
  It was first explained automatically as a flaky error; **you overturned it on 17 Oct**: "Not flaky: it happens every time with +48."
- "Link 'Moje polisy' gone from the menu since 17 Oct" — link removed **without a release** (shell still 3e1a).
- **12 links removed with release 3e1a** (footer and "Promocja wakacyjna" teasers; they are in documented screen records, so removal waits for you) — one group, bulk confirm.
Explained automatically (23): dane kierowcy: help text → Release 9c21 · "Zapisz kalkulację" removed → Release 9c21 ·
"Rabat dla stałych klientów" only for premium → Another persona · "Kod pocztowy" missing once with a script error → Flaky error ·
opcje: new checkbox "Assistance 24h" → Release 9c21 ("the app's code changed at 14:02Z on 16 Oct") ·
wynik: new layout → Release 9c21 · answered 503 once (17 Oct 10:21Z) → Flaky error (rechecked 3 times: OK) ·
Kontakt: phone field now required → Release 3e1a · link "Porównaj produkty" now leads to /porownanie-2026 → Replaced with release 3e1a ·
2 screens retired (Promocja wakacyjna, Newsletter) → Retired with 3e1a · 16–17 Oct both 5f08 and 9c21 served → Rollout ·
**New screen** Polityka cookies → Release 3e1a · footer text changes (3) and 7 other text changes → Release 3e1a.

**Review queue (Needs you): 24 items**, 7 kinds:
| Kind | Count | Items |
|---|---|---|
| Findings | 4 | A/B test? (wynik banner) · Error for one input (Kontakt +48, overturned by you) · Link removed without a release (Moje polisy) · Unexplained (Assistance 0 zł) |
| Rules | 2 | BR-021 changed · BR-026 broken |
| Removals | 12 | 12 links removed with release 3e1a (one group) |
| Processes | 2 | Napisz do nas · Przedłuż polisę (proposed) |
| Same screen? | 1 | "Kalkulator OC/AC — wynik" r2 vs r3 ("Oferta specjalna"): automatic grouping says *same screen*, Marek (BA) labelled *different* on 17 Oct 11:20Z ("The offer banner changes the page's purpose.") → **conflict** |
| Records | 3 | CAP-005, NFR-001, SCR-001 drafts (rev 1) |
| Total | 24 | oldest: 6 Oct (records); newest: 17 Oct 11:20Z (the conflict); findings from check run 01a1340c at 10:30Z |
Item detail example — **"Banner 'Oferta specjalna' on 6 of 11 visits"**: evidence = two screenshots of wynik (with / without banner),
visits from check run 01a1340c, same release 9c21, persona guest, cookie `ab_calc` = A vs B. Tests run: "replayed 10 times with
ab_calc=A → no banner 10/10; with ab_calc=B → banner 10/10: pass". Proposed explanation: A/B test. Actions: **Confirm** (A/B test),
**Reject** (reason required), **Comment**. Confirming documents both variants under step 3 and adds the cookie as a hint in Settings.
Rejecting keeps r3 as a variant of wynik with why **Unknown**; the finding stays in Needs you until it is explained.

**Linked decisions:** the A/B finding, the Same screen? conflict (wynik r2 vs r3) and the process suggestion (r3 as a variant of step 3)
are about the same banner. The detail of each lists the others under "Also settles". Confirming the A/B test settles the conflict as
"same screen, variants" (your reason is shown next to Marek's) and applies the suggestion. Settling Same screen? as "different screens"
first turns the A/B finding into "New screen on 6 of 11 visits" instead.

**Kontakt +48 tests** (after the overturn): "+48 600 000 000 → error page 5/5; 600 000 000 → Wiadomość wysłana 5/5".

**Decided (31)**, newest first, examples: 17 Oct 10:41Z you overturned Kontakt +48 ("Not flaky: it happens every time with +48.") ·
17 Oct 11:20Z Marek labelled wynik r2/r3 different screens · 15 Oct you rejected process Moje polisy ("Part of Przedłuż polisę") ·
15 Oct you confirmed BR-022 ("Matches the browser message on every visit") · 15 Oct you labelled "Strona główna" same screen as
Ubezpieczenia dla Ciebie ("Old title of the home page") · 15 Oct you edited Oblicz składkę OC/AC (moved wynik to step 3) ·
6 Oct you accepted Oblicz składkę OC/AC.

**Explained automatically: 23** in this range (96 all time; by kind Release 16 · Another persona 1 · Flaky error 2 · Replaced 1 · Rollout 1 · Retired 2), each with its rule in plain words, e.g.
"Explained as a new release because the app's code changed at 14:02Z on 16 Oct (marker 5f08 → 9c21, seen by release watch)".
Overturned example: Kontakt +48 → "Overturned · you · 17 Oct 10:41Z · Not flaky: it happens every time with +48." —
shown as overturned in Changes, on the Kontakt screen and in the Napisz do nas process.


---

## Workbench (gen UI beta) fixture

Used by `screens/wb-*`, `design-system/genui-components.html`, `workbench/examples/` and the reference app (`workbench/reference/`).

- **Replay of scan 01a110d5** on reference-insurer, sandbox, persona guest, 6 Oct, limit 400 steps. One event per step;
  event refs are `scan#step` (`01a110d5#171`). The six **route pages** below are the crawler's path; "Pages" counts every page
  recorded so far, including 11 **side trips** (pages opened from a menu, recorded and left at once). The live map folds side
  trips into a chip "+N side pages" on the page they came from: +2, +2, +2, +1, +2, +2. Route pages in visit order (Step and
  Time = when the page was opened; Pages and Queued = counts at that moment):

| # | Route | Screen | Time | Step | Pages | Queued |
|---|---|---|---|---|---|---|
| 1 | `/` | Ubezpieczenia dla Ciebie | 10:49:31Z | 12 | 3 | 15 |
| 2 | `/ubezpieczenia/samochod` | Samochód | 10:51:02Z | 38 | 6 | 31 |
| 3 | `/kalkulator/kierowca` · step 1 | Kalkulator OC/AC — dane kierowcy | 10:53:40Z | 77 | 9 | 52 |
| 4 | `/kalkulator/kierowca` · step 2 | Kalkulator OC/AC — opcje | 10:55:12Z | 102 | 11 | 66 |
| 5 | `/porownanie` | Porównanie | 10:57:05Z | 140 | 14 | 97 |
| 6 | `/kontakt` | Kontakt | 10:58:31Z | 167 | 17 | 113 |

- **Steps on /kontakt:** #167 GET /kontakt 200 (10:58:31Z) · #168 page settled, 4 fields, 1 form (10:58:33Z) · #169 next action:
  press "Wyślij" (10:58:34Z) · #170 element not found after 10 s (10:58:44Z) · #171 scan stopped (10:58:44Z).
- **The stop:** at step 171 the scan stopped because the next action (press "Wyślij") failed: the element wasn't there after the
  page settled (waited 10 s).
  ERR-01M48DVAT5E1GS5K42CTCTTDTJ. Scan status **Stopped** (ash); the stop reason and the /kontakt page are **failed** (red).
  Last good checkpoint: /porownanie, step 140. Kept: 17 pages, 113 queued links.
- **Attempts at step 171** (as on screen 15): #1 original, failed 10:58:44Z · #2 "Wait longer", failed: same error, the element
  isn't there, not a timing problem · #3 "Record the form, don't submit", **passed** 11:04:10Z: the form and its 4 fields are
  recorded, nothing is submitted. Variations come from the recovery API: `wait_longer` "Wait longer" · `record_only` "Record the
  form, don't submit" · `skip_action` "Skip this action".
- **Resume (demo):** a new scan **01a110e7** "continues 01a110d5" from /porownanie step 140, on sandbox; 17 pages and the 113
  queued links are kept. Resumed straight from the ErrorCard (wb-02), /kontakt gets one more try with the original action;
  resumed after troubleshooting (wb-04), /kontakt is recorded without submitting (attempt 3's variation).
- **Explain:** **FND-007** = the finding "Banner 'Oferta specjalna' on 6 of 11 visits" (above, proposed explanation A/B test, linked
  decisions). **CHG-019** = Kalkulator OC/AC — wynik r2 → r3, visits 01a1340c#14 (ab_calc = A) and #15 (ab_calc = B).
  **BR-021** decision table as above.
- **Chat:** PROC-001 Oblicz składkę OC/AC and rules BR-021…BR-026 with the statuses above. "How many processes are accepted?" →
  three (Oblicz składkę OC/AC, Porównaj produkty, Test process); two proposed; one rejected.
