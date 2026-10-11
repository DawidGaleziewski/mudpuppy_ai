# Data model: LLM judge mechanism (R-47)

No database change. Everything here is TypeScript types (Zod where it crosses a file boundary) and
files: label files (YAML, committed), calibration reports and trial results (JSON, generated).

## JudgeDefinition (code, one file per judge)

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string | kebab-case, unique in `JUDGES`; names the label file and report folder |
| `category` | string | the ground-truth category it judges (`terms`, `rules`, ...) |
| `question` | string | one sentence, yes/no |
| `pass` | string | what counts as pass |
| `fail` | string | what counts as fail (includes "not clearly stated") |
| `examples` | `JudgeExample[]` | 0–5; none may equal a `test` pair (R9) |
| `model` | string | default `sonnet` |
| `selectPairs` | `(ctx: SelectContext) => Pair[]` | pure; deterministic order |

`SelectContext`: `{ groundTruth, records: EvalRecord[] }` (records from `loadEvalInput`).
Helpers exported for selectors: `normalise` (from `@pathfinder/docs`), `ofKind`, `citingRoute`,
`screenRoute(gt, screenId)`, `recordText(record)`.

Derived: `version` = first 12 hex of sha256 over `question`, `pass`, `fail`, `examples`, `model`.

### JudgeExample

`{ item: string; record: string; verdict: 'pass' | 'fail'; reason: string }`

## Pair

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string | `<item id>~<record key>@<rev>` (stable) |
| `itemId` | string | ground-truth id (`T02`, `R01`) |
| `item` | string | the ground-truth text the judge reads |
| `record` | `{ key, rev, kind, text }` | `text` = readable record content (YAML-ish dump of `content`, no `kind`) |

## Verdict (one judge answer)

| Field | Type | Rule |
| --- | --- | --- |
| `pairId` | string | |
| `verdict` | `pass` \| `fail` \| `unknown` \| `error` | `error` only from the runner, never from the model |
| `reason` | string | non-empty; for `error`, the cause plus up to 300 chars of the raw answer |
| `attempts` | 1 \| 2 | retried once on error (FR-008) |
| `usage` | `{ input_tokens, output_tokens, usd }` | summed over attempts |

Model answer schema (passed to `--json-schema`, `reason` first):
`{ type: object, properties: { reason: string, verdict: enum[pass, fail, unknown] }, required: both, additionalProperties: false }`.

## JudgeRun (one judge over one store, in a trial result)

Stored in `EvalResult.judges[]` (`@pathfinder/gates`, optional, strict):

| Field | Type |
| --- | --- |
| `id`, `version`, `model` (resolved id from init, e.g. `claude-sonnet-5-5`), `claude_code_version` | string |
| `calibrated` | boolean (FR-011) |
| `covered`, `total`, `pct` | numbers: an item is covered when ≥ 1 of its pairs is `pass` |
| `counts` | `{ pass, fail, unknown, error }` over pairs |
| `skipped_pairs` | number (cap, R-edge: more candidates than the cap) |
| `cost` | `{ usd, input_tokens, output_tokens, calls }` |
| `verdicts` | `{ pair_id, verdict, reason }[]` |

Also new on `EvalResult`: `workspace?: string` (absolute path of the trial's workspace; absent for
`--in-place`, where it is the repo).

## Label file (`apps/crawler/evals/graders/human/labels/<judge-id>.yaml`, YAML, hand-edited)

```yaml
# Labels for judge glossary-terms (reference-insurer). Fill label (pass|fail) and why.
judge: glossary-terms
pairs:
  - id: T02~GL-002@1
    split: dev            # dev | test, set once from a hash of id; may be edited by hand
    source: data/db/sandbox.sqlite#reference-insurer   # or hand-made
    item: Autocasco (AC)
    record:
      key: GL-002
      rev: 1
      text: |
        term_verbatim: Autocasco (AC)
        synonyms_verbatim: AC
        definition: Voluntary insurance of the vehicle against damage and theft ...
    label:                # pass | fail, empty until labelled
    why:                  # one sentence
```

Validation (Zod on read): `judge` matches the file name; ids unique; `split` in {dev, test};
`label` empty or pass/fail; `why` required when `label` is set. Re-drawing: an existing `id` is
never changed; new ids are appended.

## Calibration report (`data/evals/judges/<judge-id>/<timestamp>-<split>.json`, generated)

| Field | Type |
| --- | --- |
| `judge`, `version`, `model`, `claude_code_version`, `split`, `at` | string |
| `runs` | 3 |
| `table` | `{ tp, fn, fp, tn }` (majority verdict vs label) |
| `tpr`, `tnr` | number 0–1, null when the denominator is 0 |
| `flip_rate` | number 0–1 |
| `skipped` | ids of pairs without a label or `why` |
| `disagreements` | `{ pair_id, label, why, majority, reasons: string[3] }[]` |
| `repeat_test_use` | boolean: a `test` report for this version already existed |
| `cost` | `{ usd, input_tokens, output_tokens, calls }` |

Calibrated (FR-011): the newest report with `split: test` and `version` = the judge's current
version has `tpr ≥ 0.9` and `tnr ≥ 0.9`.

## Isolation check result (printed, not stored)

From the judge call's `system/init` event: `tools` must be exactly `['StructuredOutput']`;
`mcp_servers` empty; every plugin's `source` ends in `@builtin`; no skill or agent name that
exists in `~/.claude/{skills,agents}` or `<repo>/.claude/{skills,agents}`; `memory_paths.auto`
inside the judge's config folder; input tokens below 2 000 (the judge prompt is ~900; a leaked
`CLAUDE.md` or rules file would add thousands). Output: pass/fail per check, model id, Claude
Code version, login source (token file or linked login).
