// BUSINESS_REQUIREMENTS.md, FUNCTIONAL_REQUIREMENTS.md, EARS.md and GAPS.md of a process export
// (spec 034 R-68). Business = capability and use-case goals plus business rules, functional =
// requirements plus NFRs (owner answer 3 of 2026-10-16); EARS is printed as the BA stored it, never
// derived (answer 2); pseudo-code of observed rules, not API client snippets (answer 7).

import { doc, inline, table } from '../render/format.js';
import type { ExportEvidence, ExportRecord } from '../render/model.js';
import type { ProcessExportModel } from './model.js';
import { navLine } from './render-steps.js';

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => inline(x)) : []);
const text = (r: ExportRecord, field: string): string =>
  typeof r.content[field] === 'string' ? inline(r.content[field]) : '';
const of = (m: ProcessExportModel, ...kinds: string[]) =>
  m.srs.records.filter((r) => kinds.includes(r.kind));

const evidence = (e: ExportEvidence): string =>
  `- ${e.target_kind.replace(/_/g, ' ')}${e.label ? ` ${inline(e.label)}` : ''}${e.run_id ? ` · scan \`${e.run_id}\`` : ''}${e.run_date ? ` · ${e.run_date}` : ''}`;

/** Anchored heading, status line, draft callout; the body; the evidence. */
function block(r: ExportRecord, body: readonly string[]): string[] {
  return [
    '',
    `### <a id="${r.key.toLowerCase()}"></a>${r.key} ${inline(r.title)}`,
    '',
    `${r.status}${r.status === 'draft' ? ' — **DRAFT**, not confirmed by a reviewer' : ''} · ${r.confidence.replace(/_/g, ' ')}${r.not_observable ? ' · not observable' : ''}`,
    '',
    ...body,
    '',
    'Evidence:',
    '',
    ...r.evidence.map(evidence),
  ];
}

interface Table {
  conditions?: unknown;
  actions?: unknown;
  rows?: unknown;
}

/** A decision table as Markdown and as pseudo-code (one branch per row). */
function decision(r: ExportRecord): string[] {
  const t = r.content.decision_table as Table | undefined;
  if (!t) return [];
  const conditions = strings(t.conditions);
  const actions = strings(t.actions);
  const rows = Array.isArray(t.rows)
    ? (t.rows as unknown[][]).map((row) => row.map((c) => inline(c)))
    : [];
  const code = rows.map((row, i) => {
    const when = conditions.map((c, j) => `${c} = ${row[j] ?? '?'}`).join(' and ');
    const then = actions.map((a, j) => `${a}: ${row[conditions.length + j] ?? '?'}`).join('; ');
    return `  ${i === 0 ? 'if' : 'else if'} ${when}:\n      ${then}`;
  });
  return [
    '',
    ...table([...conditions, ...actions], rows),
    '',
    '```text',
    `rule ${r.key} (${inline(r.title)}):`,
    ...code,
    '```',
  ];
}

const useCase = (r: ExportRecord): string[] => {
  const flow = (v: unknown) =>
    (Array.isArray(v) ? (v as { n?: number; text?: string }[]) : [])
      .map((s) => `${s.n ?? ''} ${inline(s.text)}`)
      .join(' · ');
  const branches = (v: unknown) =>
    Array.isArray(v)
      ? (v as unknown[])
          .map(flow)
          .filter((x) => x)
          .join(' / ')
      : '';
  return table(
    ['', ''],
    [
      ['Primary actor', text(r, 'primary_actor')],
      ['Preconditions', strings(r.content.preconditions).join('; ') || '—'],
      ['Trigger', text(r, 'trigger')],
      ['Main flow', flow(r.content.main_flow)],
      ['Alternate flows', branches(r.content.alternate_flows) || '—'],
      ['Exception flows', branches(r.content.exception_flows) || '—'],
      ['Postconditions', strings(r.content.postconditions).join('; ') || '—'],
    ],
  );
};

export function businessRequirements(m: ProcessExportModel): string {
  const goals = of(m, 'capability', 'use_case');
  const rules = of(m, 'business_rule');
  return doc([
    `# ${m.process.key} Business requirements`,
    '',
    navLine('BUSINESS_REQUIREMENTS.md'),
    '',
    'Business = what the business wants and the rules it applies: the capability and use-case goals, then every business rule observed on this process.',
    '',
    '## Goals',
    ...(goals.length === 0
      ? ['', '_No capability or use case documented for this process yet._']
      : goals.flatMap((r) =>
          block(r, r.kind === 'use_case' ? useCase(r) : [text(r, 'description')]),
        )),
    '',
    '## Business rules',
    ...(rules.length === 0
      ? ['', '_No business rule documented for this process yet._']
      : rules.flatMap((r) =>
          block(r, [
            `${text(r, 'statement')} _(${String(r.content.rule_type ?? '').replace(/_/g, ' ')})_`,
            ...decision(r),
          ]),
        )),
  ]);
}

function criteria(r: ExportRecord): string[] {
  const list = Array.isArray(r.content.acceptance_criteria)
    ? (r.content.acceptance_criteria as { given?: unknown; when?: unknown; then?: unknown }[])
    : [];
  return list.map(
    (c) =>
      `- **Given** ${strings(c.given).join(' **and** ')} **When** ${strings(c.when).join(' **and** ')} **Then** ${strings(c.then).join(' **and** ')}`,
  );
}

export function functionalRequirements(m: ProcessExportModel): string {
  const reqs = of(m, 'requirement');
  const nfrs = of(m, 'nfr');
  return doc([
    `# ${m.process.key} Functional requirements`,
    '',
    navLine('FUNCTIONAL_REQUIREMENTS.md'),
    '',
    'Functional = what the system shall do (requirements) and how well (non-functional requirements). Acceptance criteria as the BA stored them.',
    '',
    '## Requirements',
    '',
    ...(reqs.length === 0
      ? ['_No requirement documented for this process yet._']
      : table(
          ['Key', 'Requirement', 'Priority', 'Status'],
          reqs.map((r) => [
            `[${r.key}](#${r.key.toLowerCase()})`,
            r.title,
            String(r.content.priority ?? ''),
            r.status,
          ]),
        )),
    ...reqs.flatMap((r) => block(r, [text(r, 'statement'), '', ...criteria(r)])),
    '',
    '## Non-functional requirements',
    '',
    ...(nfrs.length === 0
      ? ['_No non-functional requirement documented for this process yet._']
      : table(
          ['Key', 'Category', 'Requirement', 'Measured', 'Status'],
          nfrs.map((r) => {
            const mm = r.content.measured as
              { value?: string; unit?: string; how?: string } | undefined;
            return [
              r.key,
              String(r.content.category ?? ''),
              text(r, 'statement'),
              mm ? `${mm.value} ${mm.unit} (${mm.how})` : '—',
              r.status,
            ];
          }),
        )),
  ]);
}

export function ears(m: ProcessExportModel): string {
  const rows = of(m, 'requirement', 'business_rule', 'nfr');
  const withEars = rows.filter(
    (r) => typeof (r.content.ears as { text?: unknown } | undefined)?.text === 'string',
  );
  const missing = rows.filter((r) => !withEars.includes(r));
  return doc([
    `# ${m.process.key} EARS statements`,
    '',
    navLine('EARS.md'),
    '',
    'Each requirement, rule and NFR as one EARS statement (Easy Approach to Requirements Syntax), as the BA agent wrote it while documenting.',
    '',
    ...(withEars.length === 0
      ? ['_No EARS statement stored yet: the BA writes them on its next pass._']
      : table(
          ['Key', 'Pattern', 'EARS statement', 'Status'],
          withEars.map((r) => {
            const e = r.content.ears as { pattern: string; text: string };
            return [r.key, e.pattern, e.text, `${r.status}, ${r.confidence.replace(/_/g, ' ')}`];
          }),
        )),
    ...(missing.length > 0
      ? ['', `Without an EARS statement: ${missing.map((r) => `\`${r.key}\``).join(', ')}.`]
      : []),
  ]);
}

export function gaps(m: ProcessExportModel): string {
  const questions = of(m, 'open_question');
  const assumptions = of(m, 'assumption');
  const followups = of(m, 'followup');
  const unobservable = m.srs.records.filter((r) => r.not_observable);
  return doc([
    `# ${m.process.key} Gaps`,
    '',
    navLine('GAPS.md'),
    '',
    'What we are unsure about. Ask the business before rebuilding.',
    '',
    '## To ask the business',
    '',
    ...(questions.length === 0
      ? ['_No open question._']
      : table(
          ['Key', 'Question', 'Status'],
          questions.map((r) => [
            `<a id="${r.key.toLowerCase()}"></a>${r.key}`,
            text(r, 'question') || r.title,
            r.status,
          ]),
        )),
    '',
    '## Assumptions the BA made',
    '',
    ...(assumptions.length === 0
      ? ['_No assumption._']
      : table(
          ['Key', 'Assumption', 'Confidence'],
          assumptions.map((r) => [
            `<a id="${r.key.toLowerCase()}"></a>${r.key}`,
            text(r, 'statement') || r.title,
            r.confidence.replace(/_/g, ' '),
          ]),
        )),
    '',
    '## Not observable',
    '',
    ...(unobservable.length === 0
      ? ['_Nothing marked as not observable._']
      : unobservable.map((r) => `- \`${r.key}\` ${inline(r.title)}`)),
    '',
    '## Follow-ups for the crawler',
    '',
    ...(followups.length === 0
      ? ['_No follow-up._']
      : table(
          ['Key', 'Follow-up', 'Status'],
          followups.map((r) => [
            `<a id="${r.key.toLowerCase()}"></a>${r.key}`,
            r.title,
            r.followup?.status ?? 'open',
          ]),
        )),
  ]);
}
