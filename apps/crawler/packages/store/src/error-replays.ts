/**
 * Rule R1 on the headless driver (spec 039 design § 8.2, § 9): a step that ended in a technical
 * error or a timeout is replayed twice with the same persona and inputs in fresh sessions. All
 * replays fail → `deterministic_error`, for a person (a business rule or a defect); any replay
 * succeeds → `flaky`, derived. `pendingErrorReplays` plans the replays of every waiting error
 * deviation; `resolveErrorReplays` classifies with their results and writes the hypothesis.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { nowIso } from '@pathfinder/core';
import { classify, MODEL_DEFAULTS, type Deviation, type DeviationKind } from '@pathfinder/model';
import { hypothesisKeys, writeHypothesis } from './interpret-writer.js';
import { journeyPath, referenceOf, type PendingReplay, type ReplayResult } from './replay-tests.js';

type Raw = BetterSqlite3.Database;

const ERRORS = ['technical_error', 'timeout'];
/** Design § 8.2: R1 replays twice. */
export const R1_REPLAYS = 2;

export interface PendingErrorReplay {
  deviationId: string;
  plan: Omit<PendingReplay, 'testId' | 'hypothesis'>;
  repeats: number;
}

interface DeviationRow {
  id: string;
  kind: DeviationKind;
  subject_key: string;
  screen_id: string;
  model_version_id: string;
  before_json: string | null;
  after_json: string | null;
  element_key: string | null;
  action_kind: string | null;
}

function waitingErrors(raw: Raw, portal: string): DeviationRow[] {
  return raw
    .prepare(
      `SELECT d.id, d.kind, d.subject_key, d.screen_id, d.model_version_id, d.before_json, d.after_json,
         a.element_key, a.kind AS action_kind
       FROM deviations d LEFT JOIN action_classes a ON a.id = d.action_class_id
       WHERE d.portal_id = ? AND d.status = 'waiting_test'
         AND json_extract(d.after_json, '$.result') IN (${ERRORS.map(() => '?').join(',')})
         AND NOT EXISTS (SELECT 1 FROM hypotheses h WHERE h.deviation_id = d.id)
       ORDER BY d.created_at, d.id`,
    )
    .all(portal, ...ERRORS) as DeviationRow[];
}

/**
 * Plans for the waiting error deviations, at most `limit` replays in all: the latest execution
 * of the failing step is walked again with the inputs it typed.
 */
export function pendingErrorReplays(
  raw: Raw,
  portal: string,
  opts: { limit?: number } = {},
): PendingErrorReplay[] {
  const budget = opts.limit ?? MODEL_DEFAULTS.replayBudget;
  const out: PendingErrorReplay[] = [];
  for (const d of waitingErrors(raw, portal)) {
    if ((out.length + 1) * R1_REPLAYS > budget) break;
    if (!d.element_key) continue;
    const result = (JSON.parse(d.after_json!) as { result: string }).result;
    const x = raw
      .prepare(
        `SELECT e.journey_id, e.seq, e.created_at, r.persona_id, r.environment FROM edges e
         JOIN runs r ON r.id = e.run_id
         JOIN screen_members m ON m.state_id = e.from_state AND m.to_model_version IS NULL
         WHERE m.screen_id = ? AND e.element_key = ? AND e.result = ? AND e.journey_id IS NOT NULL
         ORDER BY e.created_at DESC, e.id DESC LIMIT 1`,
      )
      .get(d.screen_id, d.element_key, result) as
      | {
          journey_id: string;
          seq: number;
          created_at: string;
          persona_id: string;
          environment: string;
        }
      | undefined;
    const path = x ? journeyPath(raw, x.journey_id, x.seq) : null;
    if (!x || !path) continue;
    const inputs = Object.fromEntries(
      Object.entries(referenceOf(raw, x))
        .filter(([name]) => name.startsWith('input.'))
        .map(([name, v]) => [name, String(v)]),
    );
    out.push({
      deviationId: d.id,
      plan: {
        portal,
        persona: x.persona_id,
        environment: x.environment,
        ...path,
        inputs,
        purpose: `rule R1: replay a step that ended in ${result} (headless)`,
      },
      repeats: R1_REPLAYS,
    });
  }
  return out;
}

/** The step result a replay ended with; null when it diverged before the step. */
export function replayStepResult(raw: Raw, outcome: ReplayResult): string | null {
  if (outcome.status !== 'reached' || outcome.edgeId === null) return null;
  const row = raw.prepare('SELECT result FROM edges WHERE id = ?').get(outcome.edgeId) as
    { result: string } | undefined;
  return row?.result ?? null;
}

/**
 * Classify a waiting error deviation with the step results of its replays (null = a replay that
 * diverged before the step). With no result the deviation keeps waiting. Returns the hypothesis
 * key written, or null.
 */
export function resolveErrorReplays(
  raw: Raw,
  portal: string,
  deviationId: string,
  results: readonly (string | null)[],
  now = nowIso(),
): string | null {
  const same = results.filter((r): r is string => r !== null);
  if (same.length === 0) return null;
  const d = waitingErrors(raw, portal).find((x) => x.id === deviationId);
  if (!d) return null;
  const after = JSON.parse(d.after_json!) as { toScreen: string; result: string };
  const decision = classify({
    kind: d.kind,
    result: after.result,
    buildChanged: false,
    schemaChanged: false,
    contextDiffers: false,
    sameEpochAndAudience: true,
    presentForOtherAudience: false,
    newActionSameScreens: false,
    replays: { same },
  });
  if (decision.decision !== 'hypothesis') return null;
  const deviation: Deviation = {
    kind: d.kind,
    subjectKey: d.subject_key,
    screen: d.screen_id,
    after,
    ...(d.before_json ? { before: JSON.parse(d.before_json) as Deviation['before'] } : {}),
    ...(d.element_key ? { elementKey: d.element_key } : {}),
    ...(d.action_kind ? { actionKind: d.action_kind } : {}),
  };
  const key = hypothesisKeys(raw, portal)();
  return raw.transaction(() => {
    writeHypothesis(raw, {
      portal,
      versionId: d.model_version_id,
      deviationId: d.id,
      deviation,
      decision,
      key,
      now,
    });
    raw
      .prepare('UPDATE deviations SET status = ? WHERE id = ?')
      .run(decision.derived ? 'explained' : 'open', d.id);
    return key;
  })();
}
