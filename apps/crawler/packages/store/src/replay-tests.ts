/**
 * Boundary tests run by the headless driver (spec 039 design § 9, § 11.5). `pendingReplays` turns
 * each untested `hypothesis_tests` row of a decision rule into a replay plan: the path of the
 * latest recorded execution of the decision point (clicks and submits by element key) with the
 * test's inputs. `recordReplay` keeps what the driver saw; after a reconcile, `judgeReplays`
 * names the outcome by screen key and result, sets each verdict, and moves the hypothesis:
 * a failed test refutes it, passing tests support it. A diverged replay is inconclusive.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@pathfinder/core';
import {
  ageOf,
  MODEL_DEFAULTS,
  replayInputs,
  statusOf,
  type HypothesisStatus,
} from '@pathfinder/model';
import { hypothesisEvents } from './model-decide.js';

type Raw = BetterSqlite3.Database;

export interface PendingReplay {
  testId: string;
  hypothesis: string;
  portal: string;
  persona: string;
  environment: string;
  startUrl: string;
  steps: string[];
  inputs: Record<string, string>;
  purpose: string;
}

/** What the driver saw, as `recordReplay` keeps it. */
export type ReplayResult =
  | { status: 'reached'; runId: string; transitionId: string | null; stateId: string }
  | { status: 'diverged'; runId: string | null; atStep: number; reason: string };

/** Typed by the step itself or by autofill at the submit: a replay presses only the rest. */
const PRESSED = "e.kind NOT IN ('fill', 'select', 'check')";

/**
 * The way a replay walks journey `journeyId` up to transition `seq`: its first page and the
 * element keys of the clicks and submits in order; null when the journey has no page.
 */
export function journeyPath(
  raw: Raw,
  journeyId: string,
  seq: number,
): { startUrl: string; steps: string[] } | null {
  const start = raw
    .prepare('SELECT url FROM observations WHERE journey_id = ? ORDER BY seq LIMIT 1')
    .get(journeyId) as { url: string } | undefined;
  if (!start) return null;
  const steps = raw
    .prepare(
      `SELECT e.element_key FROM transitions e WHERE e.journey_id = ? AND e.seq <= ?
       AND e.status = 'executed' AND ${PRESSED} ORDER BY e.seq`,
    )
    .all(journeyId, seq) as { element_key: string }[];
  return { startUrl: start.url, steps: steps.map((s) => s.element_key) };
}

interface Execution {
  journey_id: string;
  seq: number;
  created_at: string;
  persona_id: string;
  environment: string;
}

function latestExecution(raw: Raw, portal: string, screenKey: string, action: string) {
  return raw
    .prepare(
      `SELECT e.journey_id, e.seq, e.created_at, r.persona_id, r.environment FROM transitions e
       JOIN runs r ON r.id = e.run_id
       JOIN screen_members m ON m.state_id = e.from_state AND m.to_model_version IS NULL
       JOIN model_screens s ON s.id = m.screen_id
       WHERE r.portal_id = ? AND s.key = ? AND e.element_key = ? AND e.status = 'executed'
         AND e.journey_id IS NOT NULL
       ORDER BY e.created_at DESC, e.id DESC LIMIT 1`,
    )
    .get(portal, screenKey, action) as Execution | undefined;
}

/** The attribute values the execution saw (its journey up to the step), with derived ages. */
export function referenceOf(
  raw: Raw,
  x: Pick<Execution, 'journey_id' | 'seq' | 'created_at'>,
): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  const writes = raw
    .prepare(
      `SELECT name, value_type, value_num, value_text FROM attribute_writes
       WHERE journey_id = ? AND seq <= ? ORDER BY seq`,
    )
    .all(x.journey_id, x.seq) as {
    name: string;
    value_type: string;
    value_num: number | null;
    value_text: string | null;
  }[];
  for (const w of writes) {
    if (w.value_type === 'missing') continue;
    const v = w.value_type === 'number' || w.value_type === 'bool' ? w.value_num : w.value_text;
    if (v === null) continue;
    out[w.name] = v;
    const age = w.value_type === 'date' && w.value_text ? ageOf(w.value_text, x.created_at) : null;
    if (age) out[`derived.${w.name}.age_years`] = age.years;
  }
  return out;
}

/**
 * Replay plans for the portal's untested boundary tests, at most `limit` (the replay budget,
 * design § 9). A test with nothing to replay, or with inputs a replay cannot set, is judged
 * inconclusive here and gets no plan.
 */
export function pendingReplays(
  raw: Raw,
  portal: string,
  opts: { limit?: number; today?: string } = {},
): PendingReplay[] {
  const today = opts.today ?? nowIso();
  const tests = raw
    .prepare(
      `SELECT t.id, t.inputs_json, h.key, h.claim_json FROM hypothesis_tests t
       JOIN hypotheses h ON h.id = t.hypothesis_id
       WHERE h.portal_id = ? AND h.kind = 'decision_rule' AND t.verdict IS NULL AND t.run_id IS NULL
       ORDER BY h.key, t.created_at, t.id`,
    )
    .all(portal) as { id: string; inputs_json: string; key: string; claim_json: string }[];
  const out: PendingReplay[] = [];
  for (const t of tests) {
    if (out.length >= (opts.limit ?? MODEL_DEFAULTS.replayBudget)) break;
    const plan = planForTest(raw, portal, t, today);
    if (typeof plan === 'string') inconclusive(raw, t.id, plan);
    else out.push(plan);
  }
  return out;
}

/**
 * The replay of one test of a decision rule: the latest recorded execution of its decision
 * point, with the test's inputs. A string says why there is none.
 */
export function planForTest(
  raw: Raw,
  portal: string,
  t: { id: string; inputs_json: string; key: string; claim_json: string },
  today: string,
): PendingReplay | string {
  const point = (JSON.parse(t.claim_json) as { decisionPoint?: { screen: string; action: string } })
    .decisionPoint;
  const x = point ? latestExecution(raw, portal, point.screen, point.action) : undefined;
  if (!point || !x) return 'no recorded execution of the decision point to replay';
  const inputs = replayInputs(
    JSON.parse(t.inputs_json) as Record<string, number | string>,
    referenceOf(raw, x),
    today,
  );
  if (inputs.unsupported.length > 0) return `a replay cannot set ${inputs.unsupported.join(', ')}`;
  const path = journeyPath(raw, x.journey_id, x.seq);
  if (!path) return 'the recorded journey has no start page';
  return {
    testId: t.id,
    hypothesis: t.key,
    portal,
    persona: x.persona_id,
    environment: x.environment,
    ...path,
    inputs: inputs.values,
    purpose: `boundary test of ${t.key} (headless replay)`,
  };
}

function inconclusive(raw: Raw, testId: string, reason: string, runId: string | null = null) {
  raw
    .prepare(
      "UPDATE hypothesis_tests SET verdict = 'inconclusive', result_json = ?, run_id = ? WHERE id = ?",
    )
    .run(JSON.stringify({ reason }), runId, testId);
}

/** Keep what the driver saw; the verdict waits for the reconcile that names the screen. */
export function recordReplay(raw: Raw, testId: string, result: ReplayResult): void {
  if (result.status === 'diverged') {
    inconclusive(raw, testId, `diverged at step ${result.atStep}: ${result.reason}`, result.runId);
    return;
  }
  raw
    .prepare('UPDATE hypothesis_tests SET result_json = ?, run_id = ? WHERE id = ?')
    .run(
      JSON.stringify({ state_id: result.stateId, transition_id: result.transitionId }),
      result.runId,
      testId,
    );
}

/**
 * Verdicts for the replayed tests (after a reconcile), then the hypotheses' moves: any failed
 * test refutes, all decided tests passing supports. Returns the moves written.
 */
export function judgeReplays(
  raw: Raw,
  portal: string,
  now = nowIso(),
): { hypothesis: string; to: HypothesisStatus }[] {
  const open = raw
    .prepare(
      `SELECT t.id, t.hypothesis_id, t.inputs_json, t.refutes_if_json, t.result_json FROM hypothesis_tests t
       JOIN hypotheses h ON h.id = t.hypothesis_id
       WHERE h.portal_id = ? AND t.verdict IS NULL AND t.run_id IS NOT NULL`,
    )
    .all(portal) as {
    id: string;
    hypothesis_id: string;
    inputs_json: string;
    refutes_if_json: string;
    result_json: string;
  }[];
  const touched = new Set<string>();
  for (const t of open) {
    const seen = JSON.parse(t.result_json) as { state_id: string; transition_id: string | null };
    const outcome = outcomeOf(raw, seen);
    if (outcome === null) continue; // not reconciled yet
    const expected = (JSON.parse(t.refutes_if_json) as { notIn: string[] }).notIn;
    raw
      .prepare('UPDATE hypothesis_tests SET verdict = ?, result_json = ? WHERE id = ?')
      .run(
        expected.includes(outcome) ? 'pass' : 'fail',
        JSON.stringify({ ...seen, outcome }),
        t.id,
      );
    touched.add(t.hypothesis_id);
  }
  return [...touched].sort().flatMap((h) => moveHypothesis(raw, h, now));
}

/** `<screen key> <result>`, the outcome form the decision table uses; null before a reconcile. */
export function outcomeOf(
  raw: Raw,
  seen: { state_id: string; transition_id: string | null },
): string | null {
  const screen = raw
    .prepare(
      `SELECT s.key FROM screen_members m JOIN model_screens s ON s.id = m.screen_id
       WHERE m.state_id = ? AND m.to_model_version IS NULL`,
    )
    .get(seen.state_id) as { key: string } | undefined;
  if (!screen) return null;
  const result = seen.transition_id
    ? (raw.prepare('SELECT result FROM transitions WHERE id = ?').get(seen.transition_id) as
        { result: string } | undefined)
    : undefined;
  return `${screen.key} ${result?.result ?? 'ok'}`;
}

function moveHypothesis(raw: Raw, hypothesisId: string, now: string) {
  const verdicts = (
    raw
      .prepare('SELECT verdict FROM hypothesis_tests WHERE hypothesis_id = ?')
      .all(hypothesisId) as {
      verdict: string | null;
    }[]
  ).map((v) => v.verdict);
  const failed = verdicts.filter((v) => v === 'fail').length;
  const passed = verdicts.filter((v) => v === 'pass').length;
  const waiting = verdicts.filter((v) => v === null).length;
  const settled = waiting === 0 && passed > 0;
  if (failed === 0 && !settled) return [];
  const to: HypothesisStatus = failed > 0 ? 'refuted' : 'supported';
  const events = hypothesisEvents(raw, hypothesisId);
  const from = statusOf(events);
  // A confirmed rule is not refuted by a replay: its failed regression test is a rule mismatch
  // for R8 (`regressions.ts`, design § 11.6).
  if (from === to || (from !== 'proposed' && from !== 'testing' && from !== 'supported')) return [];
  // Testing comes first: a proposal moves to refuted only through it (design § 10.2).
  const path: HypothesisStatus[] = from === 'proposed' ? ['testing', to] : [to];
  const reason =
    to === 'refuted'
      ? `${failed} boundary test(s) led to an outcome the rule does not predict (headless replay)`
      : `${passed} boundary test(s) gave the predicted outcome (headless replay); a person confirms`;
  const insert = raw.prepare(
    'INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  let prev: HypothesisStatus = from;
  for (const step of path) {
    statusOf([
      ...hypothesisEvents(raw, hypothesisId),
      { to: step, actor: 'replay', reason, at: now },
    ]);
    insert.run(newId(), hypothesisId, prev, step, 'replay', reason, now);
    prev = step;
  }
  const key = (
    raw.prepare('SELECT key FROM hypotheses WHERE id = ?').get(hypothesisId) as { key: string }
  ).key;
  return [{ hypothesis: key, to }];
}
