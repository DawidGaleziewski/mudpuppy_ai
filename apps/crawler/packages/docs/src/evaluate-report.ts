/** The evaluation report as JSON and as the Markdown summary written next to it (`docs:evaluate`). */
import { canonical } from './render/records-json.js';
import {
  CATEGORIES,
  EXTRA_CATEGORIES,
  EXTRA_DEFAULTS,
  type AnyCategory,
  type EvaluationReport,
  type ExtraCategory,
  type Thresholds,
} from './evaluate.js';
import type { GroundTruth } from './ground-truth.js';

/** The categories a report scored: the six v1 ones, then any v2 one the ground truth had. */
export const scoredCategories = (report: EvaluationReport): AnyCategory[] => [
  ...CATEGORIES,
  ...EXTRA_CATEGORIES.filter((c) => report.scores[c] !== undefined),
];

export const minimumOf = (t: Thresholds, c: AnyCategory): number =>
  (t as Partial<Record<AnyCategory, number>>)[c] ?? EXTRA_DEFAULTS[c as ExtraCategory] ?? 0;

/** Canonical, byte-stable JSON (sorted keys, two-space indent, LF, one trailing newline). */
export const reportJson = (report: EvaluationReport): string =>
  `${JSON.stringify(canonical(report), null, 2)}\n`;

/** What a ground-truth id stands for, for the Markdown summary. */
function describe(gt: GroundTruth): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of gt.screens) out.set(s.id, `screen \`${s.route_template}\``);
  for (const f of gt.forms)
    for (const field of f.fields) {
      out.set(field.id, `field "${field.label}"`);
      for (const [kind, value] of Object.entries(field.constraints))
        out.set(
          `${field.id}.${kind}`,
          `"${field.label}" ${kind.replace(/_/g, ' ')} = ${JSON.stringify(value)}`,
        );
    }
  const route = new Map(gt.screens.map((s) => [s.id, s.route_template]));
  for (const r of gt.rules)
    out.set(
      r.id,
      `rule at "${r.anchor.label}" on \`${route.get(r.anchor.screen) ?? r.anchor.screen}\``,
    );
  for (const p of gt.processes)
    out.set(
      p.id,
      `process \`${p.first_route}\` → \`${p.last_observable_route}\` (ends: ${p.ends_with.replace(/_/g, ' ')})`,
    );
  for (const t of gt.terms) out.set(t.id, `term "${t.term}"`);
  return out;
}

/** Markdown summary written next to the JSON report: scores, every miss, every over-claim. */
export function evaluationMarkdown(report: EvaluationReport, gt: GroundTruth): string {
  const what = describe(gt);
  const lines = [
    `# Documentation evaluation: ${report.portal_id}`,
    '',
    `- **As of:** ${report.as_of || 'no revisions'}`,
    `- **Result:** ${report.passed ? 'passed' : `failed (${report.failed.join(', ')})`}`,
    '',
    '| Category | Matched | Total | Score | Minimum | Result |',
    '| --- | --- | --- | --- | --- | --- |',
    ...scoredCategories(report).map((c) => {
      const s = report.scores[c]!;
      const min = minimumOf(report.thresholds, c);
      return `| ${c} | ${s.matched} | ${s.total} | ${s.pct.toFixed(1)}% | ${min}% | ${s.pct >= min ? 'ok' : '**below**'} |`;
    }),
    `| over-claims | ${report.overclaims.length} | | | at most ${report.thresholds.overclaims} | ${report.overclaims.length <= report.thresholds.overclaims ? 'ok' : '**too many**'} |`,
    '',
    '## Missing',
  ];
  for (const c of scoredCategories(report)) {
    const missing = report.scores[c]!.missing;
    if (missing.length === 0) continue;
    lines.push('', `### ${c}`, '', ...missing.map((id) => `- ${id}: ${what.get(id) ?? id}`));
  }
  if (scoredCategories(report).every((c) => report.scores[c]!.missing.length === 0))
    lines.push('', '_nothing_');
  lines.push(
    '',
    '## Over-claims',
    '',
    ...(report.overclaims.length === 0
      ? ['_none_']
      : report.overclaims.map(
          (o) =>
            `- ${o.record} rev ${o.rev} documents ${o.ground_truth} (${what.get(o.ground_truth) ?? ''}) as observed`,
        )),
  );
  return `${lines.join('\n')}\n`;
}
