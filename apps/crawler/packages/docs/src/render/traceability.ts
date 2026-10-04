import { doc, inline, keyLink, table } from './format.js';
import type { ExportModel, ExportRecord } from './model.js';

const FILE = '12-traceability.md';
const TRACED = ['requirement', 'business_rule', 'use_case'] as const;

/** Related records in both directions, typed from the anchor's point of view. */
function related(m: ExportModel, r: ExportRecord): string[] {
  const out = r.relations.map((x) => `${x.type.replace(/_/g, ' ')} ${keyLink(x.to_key, FILE)}`);
  for (const other of m.records)
    for (const x of other.relations)
      if (x.to_key === r.key)
        out.push(`${keyLink(other.key, FILE)} ${x.type.replace(/_/g, ' ')} this`);
  return out;
}

/**
 * `12-traceability.md` (FR-052): REQ/BR/UC → related records → evidence → run, one row per evidence
 * link so every row reads left to right as one trace.
 */
export function traceability(m: ExportModel): string {
  const rows: string[][] = [];
  for (const kind of TRACED)
    for (const r of m.records.filter((x) => x.kind === kind)) {
      const rel = related(m, r).join('<br>') || '—';
      for (const e of r.evidence)
        rows.push([
          `${keyLink(r.key, FILE)} (${r.status}, ${r.confidence})`,
          rel,
          `${e.target_kind}:\`${e.target_id}\`${e.broken ? ' (broken)' : ''}${e.note ? ` — ${inline(e.note)}` : ''}`,
          e.run_id
            ? `\`${e.run_id}\` (${[e.run_mode, e.run_date].filter(Boolean).join(', ')})`
            : '—',
        ]);
    }
  return doc([
    '# 12. Traceability matrix',
    '',
    'Each functional requirement, business rule and use case, the records it relates to, the evidence',
    'it cites and the run that evidence came from. One row per evidence link.',
    '',
    ...(rows.length === 0
      ? ['_No requirements, business rules or use cases documented._']
      : table(['Record', 'Related records', 'Evidence', 'Run'], rows)),
  ]);
}
