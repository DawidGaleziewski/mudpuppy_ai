/**
 * Decision rules as DMN 1.3 files (spec 039 design § 11.4): one `<H-key>.dmn` per `decision_rule`
 * hypothesis in the chosen statuses, and a `README.md` that lists them with their status, fit and
 * boundary-test verdicts, so a reader sees which rules a person confirmed and which only the
 * replays support. Pure over the store; the script writes the files.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { statusOf, toDmnXml, type DecisionTable, type HypothesisStatus } from '@pathfinder/model';
import { hypothesisEvents } from './model-decide.js';
import { MinedRule } from './rule-mining.js';

type Raw = BetterSqlite3.Database;

export interface DecisionRuleRow {
  key: string;
  status: HypothesisStatus;
  claim: string;
  table: DecisionTable;
  tests: { pass: number; fail: number; inconclusive: number; waiting: number };
}

/** Every decision rule of the portal with a table, in key order. */
export function decisionRules(raw: Raw, portal: string): DecisionRuleRow[] {
  const rows = raw
    .prepare(
      "SELECT id, key, claim, claim_json FROM hypotheses WHERE portal_id = ? AND kind = 'decision_rule' ORDER BY key",
    )
    .all(portal) as { id: string; key: string; claim: string; claim_json: string }[];
  const verdicts = raw.prepare(
    'SELECT verdict, count(*) AS n FROM hypothesis_tests WHERE hypothesis_id = ? GROUP BY verdict',
  );
  const out: DecisionRuleRow[] = [];
  for (const r of rows) {
    const parsed = MinedRule.safeParse(JSON.parse(r.claim_json));
    if (!parsed.success || 'needs_data' in parsed.data) continue; // "needs data": no table yet
    const tests = { pass: 0, fail: 0, inconclusive: 0, waiting: 0 };
    for (const v of verdicts.all(r.id) as { verdict: string | null; n: number }[])
      tests[(v.verdict ?? 'waiting') as keyof typeof tests] += v.n;
    out.push({
      key: r.key,
      status: statusOf(hypothesisEvents(raw, r.id)),
      claim: r.claim,
      table: parsed.data,
      tests,
    });
  }
  return out;
}

/** Statuses exported by default: what a person confirmed or the replays support. */
export const EXPORTED_RULE_STATUSES: readonly HypothesisStatus[] = ['confirmed', 'supported'];

/** The export's files: `<key>.dmn` per rule in `statuses`, and the `README.md` index. */
export function dmnFiles(
  raw: Raw,
  portal: string,
  statuses: readonly HypothesisStatus[] = EXPORTED_RULE_STATUSES,
): { path: string; content: string }[] {
  const rules = decisionRules(raw, portal).filter((r) => statuses.includes(r.status));
  const files = rules.map((r) => ({ path: `${r.key}.dmn`, content: toDmnXml(r.table, r.key) }));
  const lines = [
    `# Decision rules of ${portal}`,
    '',
    `Statuses exported: ${statuses.join(', ')}. "supported" = the boundary tests gave the predicted`,
    'outcome, a person has not confirmed it yet; "confirmed" = a person did.',
    '',
    '| Rule | Status | Decided on | Fitness | Rows | Boundary tests (pass / fail / inconclusive / waiting) |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rules.map(
      (r) =>
        `| [${r.key}](${r.key}.dmn) | ${r.status} | ${r.table.decisionPoint.screen} | ${r.table.fitness} | ` +
        `${r.table.rows} | ${r.tests.pass} / ${r.tests.fail} / ${r.tests.inconclusive} / ${r.tests.waiting} |`,
    ),
  ];
  if (rules.length === 0) lines.push('', 'No rule in these statuses yet.');
  return [...files, { path: 'README.md', content: `${lines.join('\n')}\n` }];
}
