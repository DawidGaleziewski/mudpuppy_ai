import {
  byKind,
  cell,
  doc,
  field,
  FILE_OF_KIND,
  inline,
  keyLink,
  list,
  recordBlock,
  table,
} from '../format.js';
import type { ExportModel, ExportRecord } from '../model.js';

/** `10-assumptions-and-questions.md`: ASM, BA open questions, open crawler questions. */
export function assumptionsAndQuestions(m: ExportModel): string {
  const file = FILE_OF_KIND.assumption;
  const asms = byKind(m.records, 'assumption');
  const oqs = byKind(m.records, 'open_question');
  return doc([
    '# 10. Assumptions and open questions',
    '',
    '## 10.1 Assumptions',
    ...(asms.length === 0 ? ['', '_none_'] : []),
    ...asms.flatMap((a) =>
      recordBlock(a, file, [
        inline(a.content.statement),
        '',
        field('Impact if wrong', a.content.impact_if_wrong),
      ]),
    ),
    '',
    '## 10.2 Open questions',
    ...(oqs.length === 0 ? ['', '_none_'] : []),
    ...oqs.flatMap((q) =>
      recordBlock(q, file, [
        inline(q.content.question),
        '',
        field('Why it matters', q.content.why_it_matters),
        '',
        field('Answer needed from', q.content.answer_needed_from),
      ]),
    ),
    '',
    '## 10.3 Open crawler questions',
    '',
    'Questions the crawler raised during its runs that are still open.',
    '',
    ...(m.crawler_questions.length === 0
      ? ['_none_']
      : table(
          ['Question', 'Id', 'Run'],
          m.crawler_questions.map((q) => [q.text, `\`${q.id}\``, `\`${q.run_id}\``]),
        )),
  ]);
}

function followupBody(f: ExportRecord): string[] {
  const c = f.content;
  const target = (c.target ?? {}) as { url?: unknown; process_name?: unknown; goal?: unknown };
  const what =
    typeof target.process_name === 'string'
      ? `process "${inline(target.process_name)}", goal: ${inline(target.goal)}`
      : typeof target.url === 'string'
        ? `\`${target.url}\``
        : 'the portal';
  const task = f.followup;
  return [
    inline(c.question),
    '',
    field('Suggested run', `${String(c.suggested_mode)} of ${what} as ${String(c.persona)}`),
    '',
    field('Reason', c.reason),
    '',
    field(
      'Task status',
      task
        ? `${task.status.replace(/_/g, ' ')}${task.blocked_reason ? `: ${task.blocked_reason}` : ''}`
        : 'unknown',
    ),
  ];
}

const keyLine = (r: ExportRecord, file: string): string =>
  `- ${keyLink(r.key, file)} ${inline(r.title)}`;

/** `11-unknowns.md`: everything not observable, needing confirmation, still to trace, or broken. */
export function unknowns(m: ExportModel): string {
  const file = FILE_OF_KIND.followup;
  const notObservable = m.records.filter((r) => r.not_observable);
  const toConfirm = m.records.filter(
    (r) => r.confidence === 'needs_confirmation' && r.kind !== 'followup',
  );
  const boundaries = m.records.filter((r) => r.boundary !== null);
  const followups = byKind(m.records, 'followup');
  const active = followups.filter(
    (f) => f.followup?.status !== 'done' && f.followup?.status !== 'cancelled',
  );
  const closed = followups.filter((f) => !active.includes(f));
  const broken = m.records.flatMap((r) =>
    r.evidence.filter((e) => e.broken).map((e) => ({ r, e })),
  );
  return doc([
    '# 11. Unknowns',
    '',
    'What the documentation does not know: behaviour a crawl cannot observe, statements a person must',
    'confirm, processes cut off at a safety boundary, runs still to do, and evidence that is gone.',
    '',
    '## 11.1 Not observable',
    '',
    ...(notObservable.length === 0 ? ['_none_'] : notObservable.map((r) => keyLine(r, file))),
    '',
    '## 11.2 Needs confirmation',
    '',
    ...(toConfirm.length === 0 ? ['_none_'] : toConfirm.map((r) => keyLine(r, file))),
    '',
    '## 11.3 Process boundaries',
    '',
    ...(boundaries.length === 0
      ? ['_none_']
      : boundaries.map(
          (r) =>
            `- ${keyLink(r.key, file)} stops at ${inline(r.boundary!.action)}: ${inline(r.boundary!.not_observable)}`,
        )),
    '',
    '## 11.4 Follow-up tasks',
    ...(active.length === 0 ? ['', '_none open_'] : []),
    ...active.flatMap((f) => recordBlock(f, file, followupBody(f))),
    ...(closed.length > 0
      ? [
          '',
          '### Done or cancelled',
          '',
          ...closed.flatMap((f) => recordBlock(f, file, followupBody(f), 4)),
        ]
      : []),
    '',
    '## 11.5 Broken evidence links',
    '',
    'Evidence a statement cites whose recorded item no longer exists (for example after a portal data',
    'delete). The statement is kept and flagged for BA attention.',
    '',
    ...(broken.length === 0
      ? ['_none_']
      : table(
          ['Record', 'Rev', 'Evidence'],
          broken.map(({ r, e }) => [
            keyLink(r.key, file),
            r.rev,
            `${e.target_kind.replace(/_/g, ' ')} \`${e.target_id}\``,
          ]),
        )),
    '',
    '## 11.6 Open questions',
    '',
    `See [Assumptions and open questions](10-assumptions-and-questions.md): ${byKind(m.records, 'open_question').length} BA question(s), ${m.crawler_questions.length} open crawler question(s).`,
  ]);
}

/** `appendix-change-log.md`: every revision and review per record. */
export function changeLog(m: ExportModel): string {
  const out = [
    '# Appendix: change log',
    '',
    m.mode === 'all'
      ? 'Every revision of every record and its reviews. Records marked "not rendered" were rejected or withdrawn and appear only here.'
      : 'Confirmed revisions of the records in this export and their reviews.',
  ];
  if (m.change_log.length === 0) out.push('', '_none_');
  for (const entry of m.change_log) {
    out.push('', `### ${entry.key} — ${inline(entry.title)}`);
    if (entry.excluded)
      out.push(
        '',
        `_Not rendered: ${entry.excluded === 'withdrawn' ? 'withdrawn' : 'rejected, no confirmed revision'}._`,
      );
    out.push(
      '',
      ...table(
        ['Rev', 'Change', 'Status', 'Confidence', 'Created', 'Note'],
        entry.revisions.map((v) => [
          v.rev,
          v.change,
          v.status,
          `${v.confidence}${v.not_observable ? ', not observable' : ''}`,
          v.created_at,
          v.change_note ?? '',
        ]),
      ),
    );
    const reviews = entry.revisions.flatMap((v) =>
      v.reviews.map(
        (r) =>
          `rev ${v.rev} · ${r.action} · ${cell(r.reviewer)} · ${r.created_at}${r.text ? ` — "${inline(r.text)}"` : ''}`,
      ),
    );
    if (reviews.length > 0) out.push('', '**Reviews:**', '', ...list(reviews));
  }
  return doc(out);
}
