import type { DocKind } from '@mudpuppy/docs-model';
import { highlightFiles, screenFiles } from './images.js';
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
  // the interfaces of the data: their own section of chapter 7 (spec 038 FR-008)
  api_endpoint: '07-data-dictionary.md',
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
  API: 'api_endpoint',
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
      : `${e.target_kind.replace(/_/g, ' ')} \`${e.target_id}\`${e.region ? ` \`${e.region}\`` : ''}`;
  const what = inline(e.label);
  const run = e.run_id
    ? ` (run \`${e.run_id}\`${e.run_mode ? `, ${e.run_mode}` : ''}${e.run_date ? `, ${e.run_date}` : ''})`
    : '';
  const note = e.note ? ` — note: ${inline(e.note)}` : '';
  return `- ${target} — ${what}${run}${note}`;
}

/** Alt text for an image: one line, no Markdown brackets. */
const alt = (text: string): string => inline(text).replace(/[[\]]/g, '');

/**
 * Pictures of a record (spec 008 contracts/srs-export-delta.md): a screen's screenshot and
 * wireframe, and for any record its cited screen regions on a highlighted crop with a legend.
 */
export function visualLines(r: ExportRecord): string[] {
  const out: string[] = [];
  const s = screenFiles(r);
  if (s) {
    const name = `${s.screen.title} (${s.screen.route_template})`;
    out.push('', '**Screenshot:**', '');
    out.push(
      s.screenshot ? `![Screenshot of ${alt(name)}](${s.screenshot})` : '_No screenshot recorded._',
    );
    out.push('', '**Wireframe:**', '');
    if (s.wireframe_svg) {
      out.push(`![Wireframe of ${alt(name)}](${s.wireframe_svg})`);
      if (s.wireframe_excalidraw) out.push('', `[edit in Excalidraw](${s.wireframe_excalidraw})`);
    } else out.push('_No wireframe recorded._');
  }
  for (const h of highlightFiles(r)) {
    const name = `${h.screen.title} (${h.screen.route_template})`;
    out.push('', `**On screen:** ${inline(name)}`, '');
    if (h.path) out.push(`![Highlighted elements on ${alt(name)}](${h.path})`, '');
    for (const g of h.regions)
      out.push(
        `${g.n}. \`${g.key}\`${g.note ? ` — ${inline(g.note)}` : ''}${g.box ? '' : ' _(not visible on the screenshot)_'}`,
      );
  }
  return out;
}

/**
 * A rendered record: anchored heading, statement line, draft/baseline callouts, the kind-specific
 * body, pictures, related records, evidence.
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
  out.push('', ...body, ...visualLines(r));
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

/**
 * The incoming links a reader looks for on a record (spec 019 F-14): open questions about it
 * (`asks_about`) and follow-ups for it (`follows_up`). Empty when there are none, so records without
 * them render as before.
 */
export function backlinks(records: readonly ExportRecord[], key: string, file: string): string[] {
  const out: string[] = [];
  for (const [type, label] of [
    ['asks_about', 'Open questions about this'],
    ['follows_up', 'Follow-ups for this'],
  ] as const) {
    const from = incoming(records, key, type);
    if (from.length > 0)
      out.push(
        '',
        `**${label}:**`,
        '',
        ...list(from.map((r) => `${keyLink(r.key, file)} ${r.title}`)),
      );
  }
  // Spec 029: assumptions resting on this record, marked until a reviewer confirms them.
  const assumptions = incoming(records, key, 'depends_on').filter((r) => r.kind === 'assumption');
  if (assumptions.length > 0)
    out.push(
      '',
      '**Assumptions resting on this:**',
      '',
      ...list(
        assumptions.map(
          (r) =>
            `${keyLink(r.key, file)} ${r.title}${r.status === 'confirmed' ? '' : ' — to check'}`,
        ),
      ),
    );
  return out;
}
