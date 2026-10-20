// The data pass's coverage (spec 034 F-21): one data item per form field is the skill's rule, but in
// two eval trials over a map and a form-probing run the BA wrote 8 and 20 data items for 27 fields, some
// as one "payload" item per form. When the BA records the `data` pass, the server lists the
// session's form fields no data item names yet, as a warning: the BA writes them before going on.

import { readFileSync } from 'node:fs';
import type { BaContext } from '../../context.js';
import { json } from './common.js';

interface Field {
  name?: unknown;
  type?: unknown;
  label?: unknown;
}

/** Controls that are not data a person enters. */
const NOT_DATA = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
const LIST_CAP = 40;

const norm = (s: string): string => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/** What a field is called in the warning, and the names that count as documenting it. */
interface Wanted {
  shown: string;
  accepts: string[];
}

/** The fields of the session's forms: one per labelled control, one per radio group. */
function wantedFields(ctx: BaContext, sessionId: string): Wanted[] {
  const rows = ctx.raw
    .prepare(
      `SELECT f.fields_json FROM forms f
       JOIN analysis_session_runs r ON r.run_id = f.run_id WHERE r.session_id = ?`,
    )
    .all(sessionId) as { fields_json: string }[];
  const wanted = new Map<string, Wanted>();
  const radios = new Map<string, string[]>();
  for (const row of rows)
    for (const f of json<Field[]>(row.fields_json)) {
      if (typeof f.label !== 'string' || !f.label.trim()) continue;
      if (typeof f.type === 'string' && NOT_DATA.has(f.type)) continue;
      if (f.type === 'radio' && typeof f.name === 'string') {
        const options = radios.get(f.name) ?? [];
        if (!options.includes(f.label)) radios.set(f.name, [...options, f.label]);
        continue;
      }
      wanted.set(norm(f.label), { shown: `"${f.label}"`, accepts: [f.label] });
    }
  // A radio group is one field; its label is not recorded, so any option's label counts too.
  for (const [name, options] of radios)
    wanted.set(`radio:${name}`, {
      shown: `the radio group with ${options.map((o) => `"${o}"`).join(', ')}`,
      accepts: options,
    });
  return [...wanted.values()];
}

/** What the portal's data items name: their names and their allowed values. */
function documentedNames(ctx: BaContext, portalId: string): Set<string> {
  const rows = ctx.raw
    .prepare(
      `SELECT v.content_json FROM doc_records r
       JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev
       WHERE r.portal_id = ? AND r.kind = 'data_item' AND r.withdrawn = 0`,
    )
    .all(portalId) as { content_json: string }[];
  const names = new Set<string>();
  for (const { content_json } of rows) {
    const c = json<{ name_verbatim?: unknown; constraints?: { allowed_values?: unknown } }>(
      content_json,
    );
    if (typeof c.name_verbatim === 'string') names.add(norm(c.name_verbatim));
    const values = c.constraints?.allowed_values;
    if (Array.isArray(values)) for (const v of values) names.add(norm(String(v)));
  }
  return names;
}

// A term a page defines: an ARIA `term` line of its snapshot (`- term: OC`, `- term "OC"`).
const TERM_LINE = /^\s*- term(?::\s*|\s+")(.+?)"?:?\s*$/;

/**
 * Terms the session's pages define in a definition list (spec 034 F-21: the same sessions wrote 5
 * of the 10 terms the portal's glossary page lists; the baseline wrote all 10). A page with no
 * ARIA terms adds nothing; the check is a floor, not the whole glossary.
 */
function definedTerms(ctx: BaContext, sessionId: string): string[] {
  const refs = ctx.raw
    .prepare(
      `SELECT DISTINCT o.evidence_ref FROM state_observations o
       JOIN analysis_session_runs r ON r.run_id = o.run_id WHERE r.session_id = ?`,
    )
    .all(sessionId) as { evidence_ref: string }[];
  const terms = new Map<string, string>();
  for (const { evidence_ref } of refs) {
    let text: string;
    try {
      text = readFileSync(ctx.evidence.resolve(evidence_ref), 'utf8');
    } catch {
      continue; // a missing snapshot is the evidence reads' concern
    }
    for (const line of text.split('\n')) {
      const term = TERM_LINE.exec(line)?.[1]?.trim().replace(/^"|"$/g, '');
      if (term) terms.set(norm(term), term);
    }
  }
  return [...terms.values()];
}

function glossaryNames(ctx: BaContext, portalId: string): Set<string> {
  const rows = ctx.raw
    .prepare(
      `SELECT v.content_json FROM doc_records r
       JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev
       WHERE r.portal_id = ? AND r.kind = 'glossary_term' AND r.withdrawn = 0`,
    )
    .all(portalId) as { content_json: string }[];
  const names = new Set<string>();
  for (const { content_json } of rows) {
    const c = json<{ term_verbatim?: unknown; synonyms_verbatim?: unknown }>(content_json);
    if (typeof c.term_verbatim === 'string') names.add(norm(c.term_verbatim));
    if (Array.isArray(c.synonyms_verbatim))
      for (const s of c.synonyms_verbatim) names.add(norm(String(s)));
  }
  return names;
}

const listOf = (items: readonly string[]) =>
  items.slice(0, LIST_CAP).join(', ') +
  (items.length > LIST_CAP ? ` and ${String(items.length - LIST_CAP)} more` : '');

/** The warnings for a `data` pass that left fields or defined terms undocumented; none when complete. */
export function dataPassWarnings(ctx: BaContext, sessionId: string, portalId: string): string[] {
  const warnings: string[] = [];
  const documented = documentedNames(ctx, portalId);
  const missing = wantedFields(ctx, sessionId).filter(
    (w) => !w.accepts.some((a) => documented.has(norm(a))),
  );
  if (missing.length > 0)
    warnings.push(
      `${String(missing.length)} form field(s) of this session's runs have no data_item yet: ${listOf(missing.map((m) => m.shown))}. Write one data_item per field (name_verbatim = its label exactly) before the next pass; a payload or a whole form is not a field.`,
    );
  const glossary = glossaryNames(ctx, portalId);
  const terms = definedTerms(ctx, sessionId).filter((t) => !glossary.has(norm(t)));
  if (terms.length > 0)
    warnings.push(
      `${String(terms.length)} term(s) the pages define have no glossary_term yet: ${listOf(terms.map((t) => `"${t}"`))}. Write one glossary_term each (term_verbatim exactly, the page's definition) before the next pass.`,
    );
  return warnings;
}
