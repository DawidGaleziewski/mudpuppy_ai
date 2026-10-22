// A mined rule's boundary tests as a probe suite for the owner (spec 039 design § 11.5, T063;
// spec 040 T035): "the tests form a probe suite for owner review". One trace per rule, one variant
// per test: the recorded way to the decision point, the test's inputs typed in, then the decision's
// control. Tests that predict the rule's usual outcome expect `proceed`, the others `branch`, each
// with a note naming the screen it expects. The suite is stored `open` like a BA's suite: it waits
// in Review, and approving it writes it into `traces.yaml`, where it is the rule's regression suite.

import { newId, nowIso } from '@pathfinder/core';
import { TraceSpecEntry, type TraceStep } from '@pathfinder/config';
import { planForTest, type OpenedDb } from '@pathfinder/store';

type Raw = OpenedDb['raw'];

interface TestRow {
  id: string;
  inputs_json: string;
  refutes_if_json: string;
  key: string;
  claim_json: string;
  claim: string;
}

/** `button|oblicz składkę|main>form…` → a click on "oblicz składkę". */
const click = (elementKey: string): TraceStep => {
  const name = elementKey.split('|')[1]?.trim() || elementKey;
  return { name, kind: 'click', intent: `press ${name}` };
};

/** `input.data_urodzenia` = `2008-10-23` → fill "data_urodzenia". */
const fill = ([field, value]: [string, string]): TraceStep => {
  const name = field.replace(/^input\./, '');
  return { name, kind: 'fill', value, intent: `enter ${name}` };
};

const slug = (key: string) => `rule-${key.toLowerCase()}`;

function screenTitle(raw: Raw, portal: string, outcome: string): string {
  const [key = outcome] = outcome.split(/\s+/);
  const row = raw
    .prepare('SELECT title FROM model_screens WHERE portal_id = ? AND key = ?')
    .get(portal, key) as { title: string } | undefined;
  return row ? `${key} ${row.title}` : outcome;
}

/** The suite of one rule from its tests, or null when no test can be replayed. */
function suiteOf(raw: Raw, portal: string, tests: TestRow[], today: string) {
  const plans = tests
    .map((t) => ({ t, plan: planForTest(raw, portal, t, today) }))
    .filter(
      (p): p is { t: TestRow; plan: Exclude<typeof p.plan, string> } => typeof p.plan !== 'string',
    );
  if (plans.length === 0) return null;
  const expected = (t: TestRow) =>
    (JSON.parse(t.refutes_if_json) as { notIn?: string[] }).notIn?.join(' | ') ?? '';
  const counts = new Map<string, number>();
  for (const p of plans) counts.set(expected(p.t), (counts.get(expected(p.t)) ?? 0) + 1);
  const usual = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const stepsOf = (plan: (typeof plans)[number]['plan']): TraceStep[] => [
    ...plan.steps.slice(0, -1).map(click),
    ...Object.entries(plan.inputs).map(fill),
    ...plan.steps.slice(-1).map(click),
  ];
  const happy = plans.find((p) => expected(p.t) === usual)!;
  const variants = plans.map((p, i) => ({
    id: `test-${i + 1}`,
    expect: expected(p.t) === usual ? ('proceed' as const) : ('branch' as const),
    steps: stepsOf(p.plan),
  }));
  const notes = plans.map((p, i) => ({
    variant: `test-${i + 1}`,
    probe_outcome_id: null,
    why: `${Object.entries(p.plan.inputs)
      .map(([k, v]) => `${k.replace(/^input\./, '')} ${v}`)
      .join(
        ', ',
      )}: expects ${screenTitle(raw, portal, expected(p.t))} (boundary test of ${p.t.key})`,
  }));
  return { happy, variants, notes };
}

/**
 * Write an open probe suite for each decision rule with boundary tests and none yet; returns the
 * trace ids written. A rule a person rejected or that was superseded gets none.
 */
export function proposeBoundarySuites(raw: Raw, portal: string, now = nowIso()): string[] {
  const tests = raw
    .prepare(
      `SELECT t.id, t.inputs_json, t.refutes_if_json, h.key, h.claim_json, h.claim
       FROM hypothesis_tests t JOIN hypotheses h ON h.id = t.hypothesis_id
       WHERE h.portal_id = ? AND h.kind = 'decision_rule'
         AND coalesce((SELECT e.to_status FROM hypothesis_events e WHERE e.hypothesis_id = h.id
           ORDER BY e.at DESC, e.id DESC LIMIT 1), 'proposed') NOT IN ('rejected', 'superseded', 'refuted')
       ORDER BY h.key, t.created_at, t.id`,
    )
    .all(portal) as TestRow[];
  const byRule = new Map<string, TestRow[]>();
  for (const t of tests) byRule.set(t.key, [...(byRule.get(t.key) ?? []), t]);
  const exists = raw.prepare(
    "SELECT 1 FROM probe_suites WHERE portal_id = ? AND json_extract(trace_json, '$.id') = ?",
  );
  const written: string[] = [];
  for (const [key, rows] of byRule) {
    if (exists.get(portal, slug(key))) continue;
    const suite = suiteOf(raw, portal, rows, now);
    if (!suite) continue;
    const trace = TraceSpecEntry.safeParse({
      id: slug(key),
      name: `${key} boundary tests`,
      goal: rows[0]!.claim,
      start_url: suite.happy.plan.startUrl,
      steps: suite.variants.find((v) => v.expect === 'proceed')!.steps,
      variants: suite.variants,
    });
    if (!trace.success) continue;
    const run = runOfJourney(raw, portal, suite.happy.plan.startUrl);
    if (!run) continue;
    raw
      .prepare(
        `INSERT INTO probe_suites (id, portal_id, run_id, form_step_id, trace_json, notes_json, status, created_at)
         VALUES (?, ?, ?, NULL, ?, ?, 'open', ?)`,
      )
      .run(newId(), portal, run, JSON.stringify(trace.data), JSON.stringify(suite.notes), now);
    written.push(slug(key));
  }
  return written;
}

/** The latest run of the portal that opened the replay's start page (the suite's source run). */
function runOfJourney(raw: Raw, portal: string, startUrl: string): string | null {
  const row = raw
    .prepare(
      `SELECT o.run_id FROM observations o JOIN runs r ON r.id = o.run_id
       WHERE r.portal_id = ? AND o.url = ? ORDER BY o.created_at DESC LIMIT 1`,
    )
    .get(portal, startUrl) as { run_id: string } | undefined;
  return row?.run_id ?? null;
}
