import { NfrCategory } from '@pathfinder/core';
import { byKind, doc, field, FILE_OF_KIND, inline, list, recordBlock, table } from '../format.js';
import { entityDiagram } from '../mermaid.js';
import type { ExportModel, ExportRecord } from '../model.js';

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** Gherkin for acceptance criteria: one scenario per criterion, extra steps as `And`. */
function gherkin(key: string, criteria: unknown): string[] {
  const list = Array.isArray(criteria)
    ? (criteria as { given?: unknown; when?: unknown; then?: unknown }[])
    : [];
  if (list.length === 0) return ['_No acceptance criteria recorded._'];
  const steps = (word: string, items: string[]): string[] =>
    items.map((s, i) => `  ${i === 0 ? word : 'And'} ${inline(s)}`);
  return [
    '```gherkin',
    ...list.flatMap((c, i) => [
      ...(i > 0 ? [''] : []),
      `Scenario: ${key} criterion ${i + 1}`,
      ...steps('Given', strings(c.given)),
      ...steps('When', strings(c.when)),
      ...steps('Then', strings(c.then)),
    ]),
    '```',
  ];
}

/** `05-functional-requirements.md`. */
export function requirements(m: ExportModel): string {
  const file = FILE_OF_KIND.requirement;
  const reqs = byKind(m.records, 'requirement');
  return doc([
    '# 5. Functional requirements',
    ...(reqs.length === 0 ? ['', '_No requirements documented._'] : []),
    ...reqs.flatMap((r) => {
      const c = r.content;
      return recordBlock(r, file, [
        inline(c.statement),
        '',
        field('Priority', c.priority),
        ...(c.rationale
          ? [
              '',
              `${field('Rationale', c.rationale)}${c.rationale_confidence ? ` (${String(c.rationale_confidence)})` : ''}`,
            ]
          : []),
        '',
        '**Acceptance criteria:**',
        '',
        ...gherkin(r.key, c.acceptance_criteria),
      ]);
    }),
  ]);
}

/** `06-business-rules.md`: statement, type, decision table. */
export function businessRules(m: ExportModel): string {
  const file = FILE_OF_KIND.business_rule;
  const rules = byKind(m.records, 'business_rule');
  return doc([
    '# 6. Business rules',
    ...(rules.length === 0 ? ['', '_No business rules documented._'] : []),
    ...rules.flatMap((r) => {
      const c = r.content;
      const t = c.decision_table as
        { conditions?: unknown; actions?: unknown; rows?: unknown } | undefined;
      const head = t ? [...strings(t.conditions), ...strings(t.actions)] : [];
      const rows = t && Array.isArray(t.rows) ? (t.rows as unknown[][]) : [];
      return recordBlock(r, file, [
        inline(c.statement),
        '',
        field('Type', String(c.rule_type ?? '').replace(/_/g, ' ')),
        ...(head.length > 0
          ? [
              '',
              '**Decision table:**',
              '',
              ...table(
                head,
                rows.map((row) => head.map((_, i) => row[i] ?? '')),
              ),
            ]
          : []),
      ]);
    }),
  ]);
}

function constraints(c: unknown): string {
  if (!c || typeof c !== 'object') return '—';
  const parts = Object.entries(c as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
  return parts.length > 0 ? parts.join('; ') : '—';
}

/** `07-data-dictionary.md`: each DI, then an entity diagram of items seen together. */
export function dataDictionary(m: ExportModel): string {
  const file = FILE_OF_KIND.data_item;
  const items = byKind(m.records, 'data_item');
  const seenIn = (d: ExportRecord): string[] =>
    (Array.isArray(d.content.seen_in) ? (d.content.seen_in as { target_id?: string }[]) : [])
      .map((s) => s.target_id)
      .filter((s): s is string => typeof s === 'string');
  const groups = new Map<string, ExportRecord[]>();
  for (const d of items) for (const id of seenIn(d)) groups.set(id, [...(groups.get(id) ?? []), d]);
  const entities = [...groups]
    .filter(([, members]) => members.length >= 2)
    .map(([id, members]) => ({
      id,
      label: m.sightings[id] ?? id,
      attributes: members.map((d) => ({
        type: String(d.content.data_type ?? 'value'),
        name: String(d.content.name_en ?? d.key),
        comment: `${d.key} ${String(d.content.name_verbatim ?? '')}`,
      })),
    }));
  return doc([
    '# 7. Data dictionary',
    ...(items.length === 0 ? ['', '_No data items documented._'] : []),
    ...items.flatMap((d) => {
      const c = d.content;
      return recordBlock(d, file, [
        `${field('Name (verbatim)', c.name_verbatim)} (${String(c.lang ?? '')})`,
        '',
        field('English name', c.name_en),
        '',
        field('Type', c.data_type),
        '',
        field('Constraints', constraints(c.constraints)),
        '',
        '**Seen in:**',
        '',
        ...list(seenIn(d).map((id) => `${m.sightings[id] ?? 'unknown'} (\`${id}\`)`)),
      ]);
    }),
    ...(entities.length > 0
      ? [
          '',
          '## Entities',
          '',
          'Data items seen together in one form or call, grouped as an entity. No relationships are drawn: none were observed.',
          '',
          '```mermaid',
          entityDiagram({ entities }).trimEnd(),
          '```',
        ]
      : []),
  ]);
}

/** `08-glossary.md`: terms sorted by their verbatim form. */
export function glossary(m: ExportModel): string {
  const file = FILE_OF_KIND.glossary_term;
  const sortKey = (r: ExportRecord): string =>
    String(r.content.term_verbatim ?? r.title).toLowerCase();
  const terms = [...byKind(m.records, 'glossary_term')].sort((a, b) =>
    sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : a.seq - b.seq,
  );
  return doc([
    '# 8. Glossary',
    '',
    "Portal terms in the portal's own language, with English definitions.",
    ...(terms.length === 0 ? ['', '_No terms documented._'] : []),
    ...terms.flatMap((t) => {
      const c = t.content;
      const synonyms = strings(c.synonyms_verbatim);
      return recordBlock(t, file, [
        `${field('Term', c.term_verbatim)} (${String(c.lang ?? '')})`,
        '',
        field('Definition', c.definition),
        '',
        field('Synonyms', synonyms.length > 0 ? synonyms.join(', ') : '—'),
      ]);
    }),
  ]);
}

/** `09-non-functional.md`: NFRs by category, with measured values. */
export function nonFunctional(m: ExportModel): string {
  const file = FILE_OF_KIND.nfr;
  const nfrs = byKind(m.records, 'nfr');
  const out = ['# 9. Non-functional requirements'];
  if (nfrs.length === 0) out.push('', '_No non-functional requirements documented._');
  for (const category of NfrCategory.options) {
    const of = nfrs.filter((r) => r.content.category === category);
    if (of.length === 0) continue;
    out.push('', `## ${category[0]!.toUpperCase()}${category.slice(1)}`);
    for (const r of of) {
      const measured = r.content.measured as
        { value?: unknown; unit?: unknown; how?: unknown } | undefined;
      out.push(
        ...recordBlock(r, file, [
          inline(r.content.statement),
          ...(measured
            ? [
                '',
                field(
                  'Measured',
                  `${String(measured.value)} ${String(measured.unit)} (${String(measured.how)})`,
                ),
              ]
            : []),
        ]),
      );
    }
  }
  return doc(out);
}
