# Findings 039 (MudPuppy 2.0)

Bugs, slips and design deviations found while building, each with a test or eval idea
(`log-every-bug-for-evals`). Newest last.

## F-01 Fingerprint v1 already masked accessible names (T013), 2026-10-19

- **What**: design § 5.4 (from the source) lists "accessible names are masked" as a v2 change, but
  v1's `canonicalizeAria` already runs `maskVolatile` on every name, so "Koszyk (3)" and
  "Koszyk (4)" already hashed alike. The real v2 change is the repeated-sibling collapse.
- **Test**: `structure.test.ts` "masks numbers in names, so a counter does not change the key".

## F-02 Collapsing every repeated sibling run erased form fields (T013), 2026-10-19

- **What**: the design's rule, "runs of two or more consecutive siblings with the same structural
  signature collapse", also matched leaves: two textboxes in a row, three menu links, two
  paragraphs. Their names left identity, so "one added form field" (the Deployment scenario) no
  longer changed the state. **Deviation:** only row-like runs collapse: a row role (`listitem`,
  `row`, `article`, `option`, `treeitem`) or a subtree holding more than text. Leaves keep their names.
- **Test**: "never collapses leaves: a form keeps every field name, an added field changes identity";
  "keeps consecutive paragraphs as content". Eval idea: the Repeated rows and Deployment scenarios
  together (rows collapse, a new field does not).

## F-03 Element key container path made precise (T014), 2026-10-19

- **What**: the design's container path is "nearest landmark role and its name, then the nearest
  heading above", but its own example `main>form "Dane pojazdu"` has two landmarks. **Built:** every
  container ancestor outermost first (banner, navigation, main, contentinfo, complementary, region,
  search, form, dialog, alertdialog; with its name when it has one), then the nearest heading above
  inside the innermost container that has one. Ordinal only when role, name and container repeat.
  Options under a native select are skipped, as the action extractor skips them.
- **Risk** (design § 20, element-key churn): a renamed heading changes every key under it; R6
  pairs them as `replaces`. Test idea: the Renamed button scenario plus a renamed section heading.
