/**
 * The example judge (spec 017 US4, research R11; question changed to meaning on 2026-10-11, F-08):
 * does a glossary record define the term with the meaning it has on the portal? The code matcher
 * (`evaluate()`) only checks that the exact term was found; nothing checks what the BA says it
 * means. The judge sees every record sharing a word with the term, next to the portal's own
 * definition (`meaning` in the ground truth). The pattern to copy for a new judge
 * (contracts/judge-definition.md).
 */
import type { EvalRecord, GroundTruth } from '@mudpuppy/docs';
import { defineJudge, type Pair } from '../definition.js';
import { normalise, ofKind, toPair } from '../selectors.js';

/** Words of a term, without brackets and punctuation: "Autocasco (AC)" → autocasco, ac. */
const words = (s: string): string[] =>
  normalise(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);

/** The record's term and its listed synonyms. */
function namesOf(r: EvalRecord): string[] {
  const term = typeof r.content.term_verbatim === 'string' ? [r.content.term_verbatim] : [];
  const synonyms = Array.isArray(r.content.synonyms_verbatim)
    ? r.content.synonyms_verbatim.filter((s): s is string => typeof s === 'string')
    : [];
  return [...term, ...synonyms];
}

/**
 * Shares a whole word with the term ("OWU" and "OWU AC"). Whole words only: as substrings, "OC"
 * would match "Autocasco".
 */
function related(term: string, name: string): boolean {
  const ws = new Set(words(term));
  return words(name).some((w) => ws.has(w));
}

/** The term and, when the ground truth has it, the portal's definition the record is held to. */
const itemText = (t: GroundTruth['terms'][number]): string =>
  [`term: ${t.term}`, ...(t.meaning ? [`meaning on the portal: ${t.meaning}`] : [])].join('\n');

export const glossaryTerms = defineJudge({
  id: 'glossary-terms',
  category: 'terms',
  question:
    'Does this glossary record define the ground-truth term with the meaning the portal gives it?',
  pass:
    'The record is about this term (its term or a listed synonym is the term; letter case, ' +
    'punctuation or an abbreviation in brackets may differ) and its definition says the same as ' +
    "the portal's meaning, in any language or words. Extra details are fine when they do not " +
    'change or contradict that meaning.',
  fail:
    'The record is about a different, broader or narrower term (e.g. "OWU AC" for "OWU"); or its ' +
    "definition gives another meaning, contradicts the portal's, mixes the term up with a related " +
    'one (e.g. the person who pays with the person who is covered), or misses the core of the ' +
    "portal's meaning.",
  examples: [],
  selectPairs: ({ groundTruth, records }) => {
    const glossary = [...ofKind(records, 'glossary_term')].sort((a, b) =>
      a.key.localeCompare(b.key, 'en'),
    );
    return groundTruth.terms.flatMap((t): Pair[] =>
      glossary
        .filter((r) => namesOf(r).some((n) => related(t.term, n)))
        .map((r) => toPair(t.id, itemText(t), r)),
    );
  },
});
