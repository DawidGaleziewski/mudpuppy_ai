# Contract: Reference Portal Ground Truth and Evaluation

## Ground truth file

`apps/crawler/packages/reference-portal/ground-truth.json`, validated by the Zod schema
`GroundTruth` exported from `@pathfinder/reference-portal` (and re-declared generically in
`@pathfinder/docs/src/evaluate.ts` input type, so the evaluator does not import the portal).

```jsonc
{
  "portal_id": "reference-insurer",
  "screens": [{ "id": "S01", "route_template": "/", "title": "…", "guest_visible": true }],
  "forms": [{ "id": "F01", "screen": "S06", "label": "Dane pojazdu",
              "fields": [{ "id": "F01.1", "label": "Rok produkcji", "type": "number",
                           "constraints": { "required": true, "min": 1990, "max": 2026 } }] }],
  "rules": [{ "id": "R01", "statement": "Driver age must be 18–75", "type": "validation",
              "anchor": { "screen": "S07", "label": "Data urodzenia" },
              "guest_observable": true }],
  "processes": [{ "id": "P01", "name": "Oblicz składkę OC/AC", "first_route": "/kalkulator/pojazd",
                  "last_observable_route": "/kalkulator/wynik",
                  "ends_with": "mutation" | "result" | "login_wall" }],
  "terms": [{ "id": "T01", "term": "Bezszkodowa jazda", "lang": "pl" }]
}
```

Consistency test (`reference-portal/tests/ground-truth.test.ts`): every screen route answers 200 (or
the login wall for non-guest screens), every form/field label appears in the served HTML with the
declared type/required attribute, every rule anchor label appears on its screen, every term appears
on some page, every process route exists.

## `pnpm docs:evaluate <portal> --ground-truth <file> [--env <env>] [--min <category>=<pct>]… [--out <file>]`

Categories: `screens, fields, constraints, rules, processes, terms`. Defaults for `--min` are the
SC-008 targets (90, 90, 80, 70, 100, 80) and `overclaims=0`. Only guest-visible/observable ground
truth counts in the denominators; non-observable items count only for over-claims (SC-009).
Evaluates the latest non-withdrawn, non-rejected revision of each record.

Output JSON (stdout or `--out`), canonical and byte-stable:

```jsonc
{ "portal_id": "…", "as_of": "<newest revision time>",
  "scores": { "screens": { "matched": 9, "total": 10, "pct": 90.0, "missing": ["S04"] }, … },
  "overclaims": [{ "ground_truth": "R11", "record": "BR-004", "rev": 2 }],
  "passed": false, "failed": ["rules"] }
```

Plus a Markdown summary next to it when `--out` is given. Exit 0 when passed, 1 when any threshold
fails, 2 on bad input. Matching rules: [research §16](../research.md#16-goal-evaluation-docsevaluate).
