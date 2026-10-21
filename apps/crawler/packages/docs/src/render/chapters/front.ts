import type { DocKind } from '@pathfinder/docs-model';
import { doc, inline, list, modeLabel, table } from '../format.js';
import { KIND_ORDER, type ExportModel } from '../model.js';

export const KIND_LABEL: Record<DocKind, string> = {
  capability: 'Capabilities',
  screen: 'Screens',
  process: 'Processes',
  use_case: 'Use cases',
  requirement: 'Functional requirements',
  business_rule: 'Business rules',
  data_item: 'Data items',
  api_endpoint: 'API endpoints',
  glossary_term: 'Glossary terms',
  nfr: 'Non-functional requirements',
  assumption: 'Assumptions',
  open_question: 'Open questions (BA)',
  followup: 'Follow-up tasks',
};

export const CHAPTERS: readonly [string, string][] = [
  ['01-introduction.md', '1. Introduction'],
  ['02-capabilities.md', '2. Capabilities'],
  ['03-screens.md', '3. Screens'],
  ['04-processes-and-use-cases.md', '4. Processes and use cases'],
  ['05-functional-requirements.md', '5. Functional requirements'],
  ['06-business-rules.md', '6. Business rules'],
  ['07-data-dictionary.md', '7. Data dictionary'],
  ['08-glossary.md', '8. Glossary'],
  ['09-non-functional.md', '9. Non-functional requirements'],
  ['10-assumptions-and-questions.md', '10. Assumptions and open questions'],
  ['11-unknowns.md', '11. Unknowns'],
  ['12-traceability.md', '12. Traceability matrix'],
  ['appendix-change-log.md', 'Appendix: change log'],
];

/** `README.md`: title, scope line, as of, mode, counts, legend, chapter index. */
export function readme(m: ExportModel): string {
  const rows = KIND_ORDER.map((kind) => {
    const of = m.records.filter((r) => r.kind === kind);
    const draft = of.filter((r) => r.status === 'draft').length;
    return [KIND_LABEL[kind], draft, of.length - draft, of.length];
  });
  const draft = m.records.filter((r) => r.status === 'draft').length;
  return doc([
    `# Software requirements specification: ${m.portal_id}`,
    '',
    `As-is documentation of the portal \`${m.portal_id}\` (environment \`${m.environment}\`), rendered`,
    'from the Pathfinder documentation store. The outline is adapted from ISO/IEC/IEEE 29148 (SRS).',
    '',
    `- **As of:** ${m.as_of || 'no revisions'}`,
    `- **Mode:** ${modeLabel(m.mode)}`,
    `- **Records:** ${m.records.length}`,
    '',
    '## Counts',
    '',
    ...table(
      ['Kind', 'Draft', 'Confirmed', 'Total'],
      [...rows, ['**Total**', draft, m.records.length - draft, m.records.length]],
    ),
    '',
    '## Legend',
    '',
    'Every statement starts with a line `**KEY** · rev N · status · confidence` and ends',
    'with its evidence: the recorded item (kind and id), the run it came from (id, mode, date) and the',
    "BA's note. Record keys are stable across revisions.",
    '',
    '- Confidence `observed`: seen in the UI, network traffic or data during a run.',
    '- Confidence `inferred`: a reasonable deduction from what was seen.',
    '- Confidence `needs_confirmation`: business intent a person must confirm.',
    '- Status `draft`: written by the BA, not yet reviewed; such statements carry a callout saying so.',
    '- Status `confirmed`: a reviewer confirmed this revision.',
    '- `not observable`: behaviour a crawl cannot see (backend jobs, e-mails, steps behind a safety',
    '  boundary); listed again in [Unknowns](11-unknowns.md).',
    '',
    '## Chapters',
    '',
    ...CHAPTERS.map(([file, title]) => `- [${title}](${file})`),
    '- [records.json](records.json): machine-readable copy of the same records',
    '- `images/`: screenshots of the screens as first recorded (`screens/`), their wireframes',
    '  (`wireframes/`, `.svg` plus an editable `.excalidraw` file for excalidraw.com or the',
    '  Excalidraw VS Code extension) and crops with the elements a record cites outlined and',
    '  numbered (`highlights/`)',
  ]);
}

/** `01-introduction.md`: purpose, scope, personas, sources, definitions, not-observable placeholder. */
export function introduction(m: ExportModel): string {
  const routes = [
    ...new Set(
      m.records
        .filter((r) => r.kind === 'screen')
        .flatMap((r) => (Array.isArray(r.content.route_templates) ? r.content.route_templates : []))
        .map(String),
    ),
  ].sort();
  const personas = [
    ...new Set([
      ...m.runs.map((r) => r.persona_id),
      ...m.records
        .filter((r) => r.kind === 'process' && typeof r.content.persona === 'string')
        .map((r) => String(r.content.persona)),
    ]),
  ].sort();
  return doc([
    '# 1. Introduction',
    '',
    '## 1.1 Purpose',
    '',
    `This document describes the portal \`${m.portal_id}\` as it is, from recorded crawl evidence,`,
    'so that a team or an agent could re-create it. It states only what was observed or deduced, with',
    'a confidence label and evidence for every statement; what could not be observed is listed in',
    '[Unknowns](11-unknowns.md).',
    '',
    '## 1.2 Scope',
    '',
    `The observed portal area: ${routes.length} route template${routes.length === 1 ? '' : 's'} on documented screens.`,
    '',
    ...list(routes.map((r) => `\`${r}\``)),
    '',
    '## 1.3 Personas',
    '',
    ...list(personas.map((p) => `\`${p}\``)),
    '',
    '## 1.4 Sources',
    '',
    'Runs read by the analysis sessions that wrote this documentation:',
    '',
    ...(m.runs.length === 0
      ? ['_none recorded_']
      : table(
          ['Run', 'Mode', 'Environment', 'Persona', 'Date', 'Status'],
          m.runs.map((r) => [`\`${r.id}\``, r.mode, r.environment, r.persona_id, r.date, r.status]),
        )),
    '',
    '## 1.5 Definitions',
    '',
    "Portal terms are defined in the [Glossary](08-glossary.md), in the portal's own language.",
    'Status and confidence labels are explained in the [README](README.md#legend).',
    '',
    '## 1.6 Business goals and stakeholders',
    '',
    inline(
      'Not observable. Business goals, stakeholders, responsibilities and a gap analysis (as-is vs. to-be) cannot be seen from the portal and are out of scope for this documentation.',
    ),
  ]);
}
