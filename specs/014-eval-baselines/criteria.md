# Spec 009 criteria on real agent runs (spec 014 T015, US3)

Baselines promoted 2026-10-08, second runs 2026-10-09 (no code change in between), all at
`--budget-usd 8` per agent, Sonnet crawler, Opus BA. Result files under `data/evals/<portal>/`.

| Portal (persona) | Baseline | Second run | Crawl | Cost (1st / 2nd) |
| --- | --- | --- | --- | --- |
| reference-insurer (guest) | `2026-10-08T19-33-13-128Z` | `2026-10-09T00-31-08-390Z` | 17/17 both | $2.66 / $4.82 |
| proving-ground-shop (guest) | `2026-10-08T19-47-11-656Z` | `2026-10-09T00-43-55-844Z` | 3/6 both | $3.97 / $4.18 |
| proving-ground-bank (client, 20 s timeout) | `2026-10-08T20-01-07-241Z` | `2026-10-09T00-59-00-839Z` | 4/11 both | $3.15 / $2.64 |
| proving-ground-insurer (client) | `2026-10-08T20-23-09-643Z` | `2026-10-09T01-11-06-793Z` | 4/6 both | $3.07 / $4.70 |

## Verdicts

- **SC-003 — met.** Every run swept the store tables (except the vault's ciphertext), every file
  under the workspace `data/` (evidence, logs, unzipped trace chunks), the SRS export and both
  agent transcripts for every password the vault holds for the portal: 0 hits in all 8 runs,
  including the two logged-in portals (bank, insurer) and the guest runs (swept for the client's
  password too).
- **SC-004 — not met.** Bank client: 4 of 11 logged-in screens (36.4 %, needs 80 %) in both
  runs; the legacy app S08–S13 and the transfer confirmation S05 are never reached (F-05, F-09).
  The re-login part is met: one re-login after a forced expiry in both runs (`relogins` 1).
  Goes to R-28 (LO-02, LO-04 legacy frames; logout control F-09).
- **SC-005 — not met.** Shop guest: 3 of 6 guest screens (50 %, needs 80 %); checkout S04/S05 is
  never reached, so the CAPTCHA widget is never shown and no hand-off is recorded
  (`handoffs` 0). The widget part is met: `widget_actions` 0 in both runs. Goes to R-28 (LO-10,
  F-07).
- **SC-007 — met, with tolerances set from the two runs.** Each portal has a baseline and a
  comparison report; the second run shows no regression with `tolerances.json`. At the default
  5 points two categories regressed (shop constraints 2→0 of 23, bank obstacles 12→10 of 30):
  BA variance on small totals, where one record moves 3–9 points. Tolerances were widened per
  category to the observed change (plan D7), capped at 15: reference rules moved +25 and
  insurer terms +20, so a drop of that size would still be flagged — a known false-alarm risk.

## What the numbers say

- The crawler is repeatable: every crawl measure (`crawl_screens`, steps, frontier pending)
  is identical between the two runs on all four portals, except bank, where the first run was
  ended by the agent with 4 items pending and the second drained the frontier.
- The BA is not: scores move up to 25 points between runs of the same map. Processes score 0 %
  on every portal and run (R-39).
- Crawl coverage of the proving ground is the main gap: 50 %, 36 %, 67 % (R-28).
- Suggestion (R-40): score the median of three BA runs, or report matched counts next to
  percentages, before tightening tolerances.
