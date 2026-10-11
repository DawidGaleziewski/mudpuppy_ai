# Contract: declaring a judge (R-47)

This is the part the owner writes for each new judge (the rules judge first). Nothing else in the
mechanism changes. Shapes are in `data-model.md`.

## Steps

1. Create `apps/crawler/evals/graders/model/judges/<id>.ts` exporting one `JudgeDefinition`.
2. Add it to `JUDGES` in `judges/index.ts` (one line).
3. `pnpm eval:draw <id> --portal <portal> --store <path>` and label the pairs in
   `evals/graders/human/labels/<id>.yaml`.
4. `pnpm eval:calibrate <id> --split dev`, read the disagreements, refine `question`, `pass`,
   `fail` or `examples` (or a label), repeat; then once `--split test`.

## Shape (illustrative, not the implementation)

```ts
export const glossaryTerms: JudgeDefinition = {
  id: 'glossary-terms',
  category: 'terms',
  // Changed 2026-10-11 from "names the same term" to the meaning (findings F-08).
  question: 'Does this glossary record define the ground-truth term with the meaning the portal gives it?',
  pass: 'The record is about this term and its definition says the same as the portal\'s meaning, ' +
    'in any language or words; extra details are fine when they do not change it.',
  fail: 'A different, broader or narrower term, or a definition with another meaning, one that ' +
    'mixes the term up with a related one, or misses its core.',
  examples: [],
  selectPairs: ({ groundTruth, records }) => /* pure code: candidates per term */ [],
};
```

## Rules

- One narrow yes/no question; no scale, no comparison between records (FR-004).
- `fail` covers "not clearly stated" (leniency defence).
- `selectPairs` is pure and deterministic (same input → same pairs, same order). It decides
  what the judge sees; looser than the code matcher if the judge is to find false fails.
- Examples come from the owner's `dev` labels, never `test` (calibration refuses).
- Changing `question`, `pass`, `fail`, `examples` or `model` changes the version: the judge is
  uncalibrated until a new `test` report.
- The runner adds, for every judge: the system prompt frame (role, the answer shape, "reason
  first", "answer unknown when the record lacks the information"), the item and the record as
  delimited blocks, and nothing else (no code score, no transcript).
