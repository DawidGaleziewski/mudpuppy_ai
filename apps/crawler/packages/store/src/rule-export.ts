/**
 * Decision rules exported (spec 039 design § 11.4, owner answer OV-5): per `decision_rule`
 * hypothesis in the chosen statuses a DMN 1.3 file and a Markdown page, a CSV of them all, and a
 * `README.md` that lists them with their status, fit and boundary-test verdicts, so a reader sees
 * which rules a person confirmed and which only the replays support. Pure over the store; the
 * script writes the files.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { statusOf, toDmnXml, type DecisionTable, type HypothesisStatus } from '@pathfinder/model';
import { hypothesisEvents } from './model-decide.js';
import { type RuleTextContext, ruleMarkdown, rulesCsv, shownKey } from './rule-export-text.js';
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

/** Every status, for an export that shows rejected and replaced rules too (marked). */
export const ALL_RULE_STATUSES: readonly HypothesisStatus[] = [
  'proposed',
  'testing',
  'supported',
  'confirmed',
  'refuted',
  'rejected',
  'superseded',
];

/**
 * The text context from the store: the BA's business rule record (BR-nnn) citing each rule
 * (owner answer 18 (b)) and the model's screens by key.
 */
export function ruleTextContext(raw: Raw, portal: string): RuleTextContext {
  const screens = new Map(
    (
      raw
        .prepare('SELECT key, title, route_key FROM model_screens WHERE portal_id = ?')
        .all(portal) as { key: string; title: string; route_key: string }[]
    ).map((s) => [s.key, { title: s.title, route: s.route_key }]),
  );
  const br = new Map(
    (
      raw
        .prepare(
          `SELECT h.key AS hkey, r.key AS brkey FROM hypotheses h
           JOIN doc_evidence e ON e.target_kind = 'hypothesis' AND e.target_id = h.id
           JOIN doc_revisions v ON v.id = e.revision_id
           JOIN doc_records r ON r.id = v.record_id AND v.rev_no = r.latest_rev
           WHERE h.portal_id = ? AND r.kind = 'business_rule' AND r.withdrawn = 0
           ORDER BY r.seq DESC`,
        )
        .all(portal) as { hkey: string; brkey: string }[]
    ).map((r) => [r.hkey, r.brkey]),
  );
  return { brKey: (k) => br.get(k) ?? null, screen: (k) => screens.get(k) ?? null };
}

/**
 * The export's files (owner answer OV-5): per rule in `statuses` its DMN table `<key>.dmn` and its
 * Markdown `<key>.md` (named by the BR key once documented), `rules.csv` of them all, and the
 * `README.md` index.
 */
export function ruleFiles(
  raw: Raw,
  portal: string,
  statuses: readonly HypothesisStatus[] = EXPORTED_RULE_STATUSES,
): { path: string; content: string }[] {
  const ctx = ruleTextContext(raw, portal);
  const rules = decisionRules(raw, portal).filter((r) => statuses.includes(r.status));
  const files = rules.flatMap((r) => {
    const key = shownKey(r, ctx);
    return [
      { path: `${key}.dmn`, content: toDmnXml(r.table, key) },
      { path: `${key}.md`, content: ruleMarkdown(r, ctx) },
    ];
  });
  const lines = [
    `# Decision rules of ${portal}`,
    '',
    `Statuses exported: ${statuses.join(', ')}. "supported" = the boundary tests gave the predicted`,
    'outcome, a person has not confirmed it yet; "confirmed" = a person did. Each rule is a DMN',
    'table (`.dmn`) and a Markdown page (`.md`, the sentence first, then the table); `rules.csv`',
    'has every rule, a line per table row.',
    '',
    '| Rule | Status | Decided on | Fitness | Rows | Boundary tests (pass / fail / inconclusive / waiting) |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rules.map((r) => {
      const key = shownKey(r, ctx);
      const where = ctx.screen(r.table.decisionPoint.screen)?.title ?? r.table.decisionPoint.screen;
      return (
        `| [${key}](${key}.md) ([DMN](${key}.dmn)) | ${r.status} | ${where} | ${r.table.fitness} | ` +
        `${r.table.rows} | ${r.tests.pass} / ${r.tests.fail} / ${r.tests.inconclusive} / ${r.tests.waiting} |`
      );
    }),
  ];
  if (rules.length === 0) lines.push('', 'No rule in these statuses yet.');
  return [
    ...files,
    { path: 'rules.csv', content: rulesCsv(rules, ctx) },
    { path: 'README.md', content: `${lines.join('\n')}\n` },
  ];
}
