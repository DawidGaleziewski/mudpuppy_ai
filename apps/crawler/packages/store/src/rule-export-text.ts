/**
 * Decision rules as text for the people who rebuild the portal (spec 039 owner answer OV-5, UX G13,
 * designer screen v2-12 "In the export"): one Markdown file per rule, the sentence first for
 * readers who skip tables, then the exact table; and one CSV of every rule, a line per table row.
 * Screen names stay as the portal shows them; routes are in brackets. Pure over the rows given.
 */
import type { HypothesisStatus } from '@mudpuppy/model';
import type { DecisionRuleRow } from './rule-export.js';

/** A screen of the model by key: its title and route. */
export interface ScreenName {
  title: string;
  route: string;
}

/** What the text needs besides the rule: the BR key that documents it and the screens' names. */
export interface RuleTextContext {
  brKey: (hypothesisKey: string) => string | null;
  screen: (key: string) => ScreenName | null;
}

/** The UI's rule statuses (12-v2-ux.md § 4), as the dashboard words them. */
export const RULE_STATUS_WORDS: Record<HypothesisStatus, string> = {
  proposed: 'proposed, not tested yet',
  testing: 'proposed, being tested',
  supported: 'tested, not confirmed yet (needs a person)',
  confirmed: 'confirmed',
  refuted: 'broken: a boundary test failed',
  rejected: 'rejected by a person',
  superseded: 'changed: it no longer holds on a newer release (re-mine it; needs a person)',
};

/** A superseded rule with a newer rule in its place is replaced; without one, it changed. */
export const ruleStatusText = (r: DecisionRuleRow): string =>
  r.status === 'superseded' && r.replaced
    ? 'replaced by a newer rule'
    : RULE_STATUS_WORDS[r.status];

// Who writes lifecycle events without a person (the dashboard's MACHINE_ACTORS).
const MACHINE_ACTORS = new Set(['reconciler', 'miner', 'replay', 'crawler', 'ba-agent']);

/** The history lines of the export (v2-12 "In the export"): changes, then a person's decisions. */
export function historyLines(r: DecisionRuleRow): string[] {
  const day = (at: string) => at.slice(0, 10);
  return (r.history ?? []).flatMap((e) => {
    if (e.to === 'superseded') return [`- Changed: ${day(e.at)}: ${e.reason}`];
    if (MACHINE_ACTORS.has(e.actor)) return [];
    if (e.undo) return [`- Undone: ${day(e.at)} · ${e.actor}: back to ${e.to}`];
    return [`- Decided: ${day(e.at)} · ${e.actor}: ${e.to}, "${e.reason}"`];
  });
}

const RESULT_WORDS: Record<string, string> = {
  ok: '',
  validation: 'a validation message',
  business_error: 'a business refusal',
  technical_error: 'a technical error',
  timeout: 'a timeout',
  blocked: 'blocked',
};

export const shownKey = (r: DecisionRuleRow, ctx: RuleTextContext): string =>
  ctx.brKey(r.key) ?? r.key;

function screenText(key: string, ctx: RuleTextContext): string {
  const s = ctx.screen(key);
  return s ? `${s.title} (${s.route})` : key;
}

/** `SC-0040 ok` → "Kalkulator — opcje (/kalkulator)"; a result other than ok is said after it. */
export function outcomeText(then: string, ctx: RuleTextContext): string {
  const [screen = then, result = 'ok'] = then.split(/\s+/, 2);
  const words = RESULT_WORDS[result] ?? result.replace(/_/g, ' ');
  return words ? `${screenText(screen, ctx)} with ${words}` : screenText(screen, ctx);
}

/** An element key (`role|name|landmark|…`) as people say it: `"Oblicz składkę"`. */
export function actionText(elementKey: string): string {
  const [, name = ''] = elementKey.split('|');
  return name.trim() ? `"${name.trim()}"` : elementKey;
}

/** A mined input as people say it: `derived.input.data_urodzenia.age_years` → "age from data_urodzenia". */
export function inputText(name: string): string {
  const age = /^derived\.input\.(.+)\.age_years$/.exec(name);
  if (age) return `age from ${age[1]}`;
  const field = /^(?:derived\.)?input\.(.+)$/.exec(name);
  return field ? field[1]! : name;
}

function conditionText(raw: string, condition: string): string {
  const name = inputText(raw);
  const c = condition.trim();
  const list = /^in\s*\[(.*)\]$/.exec(c);
  if (list) return `${name} is one of ${list[1]!.trim()}`;
  const eq = /^=\s*(.+)$/.exec(c);
  if (eq) return `${name} is ${eq[1]!.trim()}`;
  return `${name} ${c.replace(/^>=/, '≥').replace(/^<=/, '≤')}`;
}

/** One sentence per table row: "If age < 21, "Dalej" on … leads to …". */
export function ruleSentence(r: DecisionRuleRow, ctx: RuleTextContext): string {
  const where = `${actionText(r.table.decisionPoint.action)} on ${ctx.screen(r.table.decisionPoint.screen)?.title ?? r.table.decisionPoint.screen}`;
  return r.table.rules
    .map((row) => {
      const when = Object.entries(row.when)
        .filter(([, c]) => c.trim() !== '' && c.trim() !== '-')
        .map(([n, c]) => conditionText(n, c));
      const lead = when.length > 0 ? `If ${when.join(' and ')}, ${where}` : `Otherwise ${where}`;
      return `${lead} leads to ${outcomeText(row.then, ctx)}.`;
    })
    .join(' ');
}

const cell = (s: string): string => s.replace(/\|/g, '\\|');

/** The rule as Markdown: heading, sentence, facts, the table, tests and status. */
export function ruleMarkdown(r: DecisionRuleRow, ctx: RuleTextContext): string {
  const t = r.table;
  const key = shownKey(r, ctx);
  const names = t.inputs.map((i) => i.name);
  const lines = [
    `## ${key} · ${r.claim}`,
    '',
    r.wording?.wording ?? ruleSentence(r, ctx),
    '',
    ...(r.wording
      ? [
          `- Reworded: ${r.wording.at.slice(0, 10)} · ${r.wording.actor}`,
          `- As mined: ${ruleSentence(r, ctx)}`,
        ]
      : []),
    `- Where: ${screenText(t.decisionPoint.screen, ctx)}, action ${actionText(t.decisionPoint.action)} (\`${t.decisionPoint.action}\`)`,
    `- Inputs: ${names.map((n) => `${inputText(n)} (\`${n}\`)`).join(', ') || '(none)'}`,
    `- Hit policy: ${t.hitPolicy === 'U' ? 'first match (rows are checked in order; the first that matches decides)' : 'any match (every matching row applies)'}`,
    '',
    `| # | ${names.map(cell).join(' | ')} | → Next screen |`,
    `|---|${names.map(() => '---|').join('')}---|`,
    ...t.rules.map(
      (row, n) =>
        `| ${n + 1} | ${names.map((i) => cell(row.when[i] ?? '-')).join(' | ')} | ${cell(outcomeText(row.then, ctx))} |`,
    ),
    '',
    `- Tested: ${r.tests.pass} pass, ${r.tests.fail} fail, ${r.tests.inconclusive} inconclusive, ${r.tests.waiting} waiting`,
    `- Mined from: ${t.rows} cases · fitness ${t.fitness} · precision ${t.precision}`,
    ...historyLines(r),
    `- Status: ${ruleStatusText(r)}`,
    ...(key !== r.key ? [`- Finding: ${r.key}`] : []),
  ];
  return `${lines.join('\n')}\n`;
}

const csvCell = (s: string | number): string => {
  const v = String(s);
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export const CSV_HEADER = [
  'rule',
  'finding',
  'status',
  'screen',
  'route',
  'action',
  'row',
  'conditions',
  'next_screen',
  'next_route',
  'result',
  'fitness',
  'tests_pass',
  'tests_fail',
] as const;

/** Every rule in one CSV, a line per table row (conditions as "name cond; …"). */
export function rulesCsv(rules: readonly DecisionRuleRow[], ctx: RuleTextContext): string {
  const out = [CSV_HEADER.join(',')];
  for (const r of rules) {
    const at = ctx.screen(r.table.decisionPoint.screen);
    r.table.rules.forEach((row, n) => {
      const [next = row.then, result = 'ok'] = row.then.split(/\s+/, 2);
      const to = ctx.screen(next);
      const conditions = Object.entries(row.when)
        .map(([i, c]) => `${i} ${c.trim()}`)
        .join('; ');
      out.push(
        [
          shownKey(r, ctx),
          r.key,
          r.status,
          at?.title ?? r.table.decisionPoint.screen,
          at?.route ?? '',
          r.table.decisionPoint.action,
          n + 1,
          conditions,
          to?.title ?? next,
          to?.route ?? '',
          result,
          r.table.fitness,
          r.tests.pass,
          r.tests.fail,
        ]
          .map(csvCell)
          .join(','),
      );
    });
  }
  return `${out.join('\n')}\n`;
}
