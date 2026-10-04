import type { DocKind } from '@pathfinder/core';
import type { ExportEvidence, ExportMode, ExportRecord } from './model.js';

/** Which chapter file renders each kind (contracts/srs-export.md "Files"). */
export const FILE_OF_KIND: Record<DocKind, string> = {
  capability: '02-capabilities.md',
  screen: '03-screens.md',
  process: '04-processes-and-use-cases.md',
  use_case: '04-processes-and-use-cases.md',
  requirement: '05-functional-requirements.md',
  business_rule: '06-business-rules.md',
  data_item: '07-data-dictionary.md',
  glossary_term: '08-glossary.md',
  nfr: '09-non-functional.md',
  assumption: '10-assumptions-and-questions.md',
  open_question: '10-assumptions-and-questions.md',
  followup: '11-unknowns.md',
};

const KIND_OF_PREFIX: Record<string, DocKind> = {
  CAP: 'capability',
  SCR: 'screen',
  PROC: 'process',
  UC: 'use_case',
  REQ: 'requirement',
  NFR: 'nfr',
  BR: 'business_rule',
  GL: 'glossary_term',
  DI: 'data_item',
  ASM: 'assumption',
  OQ: 'open_question',
  FUP: 'followup',
};

/**
 * One file's text: lines joined with LF, runs of blank lines collapsed to one, exactly one trailing
 * newline (FR-053: byte-stable, diffable).
 */
export function doc(lines: readonly string[]): string {
  const out: string[] = [];
  for (const line of lines.flatMap((l) => l.split('\n'))) {
    const trimmed = line.replace(/\s+$/, '');
    if (trimmed === '' && (out.length === 0 || out.at(-1) === '')) continue;
    out.push(trimmed);
  }
  while (out.at(-1) === '') out.pop();
  return `${out.join('\n')}\n`;
}

/** Prose on one line: whitespace collapsed. */
export const inline = (text: unknown): string =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** A Markdown table cell: one line, pipes escaped. */
export const cell = (text: unknown): string => inline(text).replace(/\|/g, '\\|');

export function table(head: readonly string[], rows: readonly (readonly unknown[])[]): string[] {
  return [
    `| ${head.map(cell).join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ];
}

/** A link to a record's anchor, relative to the file it appears in. */
export function keyLink(key: string, fromFile: string): string {
  const kind = KIND_OF_PREFIX[key.split('-')[0]!];
  const file = kind ? FILE_OF_KIND[kind] : undefined;
  if (!file) return key;
  return file === fromFile ? `[${key}](#${key})` : `[${key}](${file}#${key})`;
}

export const modeLabel = (mode: ExportMode): string =>
  mode === 'confirmed' ? 'confirmed only' : 'all, drafts marked';

/** `**REQ-007** · rev 3 · confirmed · observed` (contracts/srs-export.md "Statement format"). */
export function statementLine(r: ExportRecord): string {
  const parts = [`**${r.key}**`, `rev ${r.rev}`, r.status, r.confidence];
  if (r.not_observable) parts.push('not observable');
  return parts.join(' · ');
}

export function evidenceLine(e: ExportEvidence, fromFile: string): string {
  const target =
    e.target_kind === 'doc_record' && e.doc_key
      ? `record ${keyLink(e.doc_key, fromFile)}`
      : `${e.target_kind.replace(/_/g, ' ')} \`${e.target_id}\``;
  const what = e.broken ? '**broken: the target no longer exists**' : inline(e.label);
  const run = e.run_id
    ? ` (run \`${e.run_id}\`${e.run_mode ? `, ${e.run_mode}` : ''}${e.run_date ? `, ${e.run_date}` : ''})`
    : '';
  const note = e.note ? ` — note: ${inline(e.note)}` : '';
  return `- ${target} — ${what}${run}${note}`;
}

/**
 * A rendered record: anchored heading, statement line, draft/baseline callouts, the kind-specific
 * body, related records, evidence.
 */
export function recordBlock(
  r: ExportRecord,
  file: string,
  body: readonly string[],
  level = 3,
  /** Relation types the body already lists (e.g. a capability's `contains`). */
  shownInBody: readonly string[] = [],
): string[] {
  const relations = r.relations.filter((x) => !shownInBody.includes(x.type));
  const out = [
    '',
    `${'#'.repeat(level)} <a id="${r.key}"></a>${r.key} — ${inline(r.title)}`,
    '',
    statementLine(r),
  ];
  if (r.status === 'draft') out.push('', '> DRAFT — not confirmed by a reviewer');
  if (r.baseline_rev !== null)
    out.push(r.status === 'draft' ? '>' : '', `> confirmed baseline: rev ${r.baseline_rev}`);
  if (typeof r.content.summary === 'string') out.push('', inline(r.content.summary));
  out.push('', ...body);
  if (relations.length > 0)
    out.push(
      '',
      `Related: ${relations.map((x) => `${x.type.replace(/_/g, ' ')} ${keyLink(x.to_key, file)}`).join(' · ')}`,
    );
  out.push('', 'Evidence:', '', ...r.evidence.map((e) => evidenceLine(e, file)));
  return out;
}

export const list = (items: readonly unknown[], empty = '_none recorded_'): string[] =>
  items.length === 0 ? [empty] : items.map((i) => `- ${inline(i)}`);

export const field = (name: string, value: unknown): string => `**${name}:** ${inline(value)}`;

export const byKind = (records: readonly ExportRecord[], kind: DocKind): ExportRecord[] =>
  records.filter((r) => r.kind === kind);

/** Records pointing at `key` with relation `type` (incoming), in export order. */
export const incoming = (
  records: readonly ExportRecord[],
  key: string,
  type: string,
): ExportRecord[] =>
  records.filter((r) => r.relations.some((x) => x.type === type && x.to_key === key));
