/**
 * Rules R4 and R5 on the headless driver (spec 039 design § 8.2, spec 046, R-88): a deviation
 * waiting on its context or on randomness is walked again.
 *
 * - R4 (the audiences of the deviating visit and its reference differ): once as the reference
 *   visit's persona along its path, once as the deviating visit's. Each landing on its own visit's
 *   state → `context_variant`, derived. Otherwise R5 follows in the same call.
 * - R5: three times as the deviating visit's persona. The same landing every time → nothing random
 *   (`ambiguous`, for the agent); alternating landings with one flag (a cookie or web storage key a
 *   probe run recorded) whose value is the same within each landing and differs between them →
 *   `ab_test` for a person, "separated by cookie:NAME"; alternating without one → `nondeterministic`.
 *
 * `pendingContextReplays` plans them; `resolveContextReplays` classifies with the results and
 * writes the hypothesis. A replay that diverged counts as no result.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { nowIso } from '@mudpuppy/core';
import { classify, MODEL_DEFAULTS, type Deviation, type DeviationKind } from '@mudpuppy/model';
import { visitPair, type VisitContext } from './deviation-visits.js';
import { hypothesisKeys, writeHypothesis } from './interpret-writer.js';
import { journeyPath, referenceOf, type ReplayResult } from './replay-tests.js';

type Raw = BetterSqlite3.Database;

/** Design § 8.2: R5 replays three times; R4 once per context. */
export const R5_REPLAYS = 3;

/** One walk of a visit: who, from where, which presses, what it types, whether it logs in. */
export interface VisitReplay {
  portal: string;
  persona: string;
  environment: string;
  startUrl: string;
  steps: string[];
  inputs: Record<string, string>;
  /** The visit's run logged in: the replay logs in first (spec 046 FR-007). */
  login: boolean;
  purpose: string;
}

export interface PendingContextReplay {
  deviationId: string;
  /** R4: both visits' walks; null when the audiences are the same (straight to R5). */
  r4: {
    reference: VisitReplay;
    current: VisitReplay;
    referenceState: string;
    currentState: string;
  } | null;
  /** R5: the deviating visit's walk, replayed `R5_REPLAYS` times. */
  r5: VisitReplay;
}

/** What one replay came to: the state it landed on and the flags of its last observation. */
export interface ReplayLanding {
  stateId: string | null;
  flags: Record<string, string>;
}

interface WaitingRow {
  id: string;
  kind: DeviationKind;
  subject_key: string;
  screen_id: string;
  state_id: string | null;
  model_version_id: string;
  before_json: string | null;
  after_json: string | null;
  element_key: string | null;
  action_kind: string | null;
}

const ERRORS = ['technical_error', 'timeout'];

/** Deviations waiting on R4 or R5: not an error (R1), not a rule test (R8), no hypothesis yet. */
function waitingContext(raw: Raw, portal: string): WaitingRow[] {
  return raw
    .prepare(
      `SELECT d.id, d.kind, d.subject_key, d.screen_id, d.state_id, d.model_version_id, d.before_json,
         d.after_json, a.element_key, a.kind AS action_kind
       FROM deviations d LEFT JOIN action_classes a ON a.id = d.action_class_id
       WHERE d.portal_id = ? AND d.status = 'waiting_test'
         AND d.kind NOT IN ('rule_mismatch', 'missing_action')
         AND coalesce(json_extract(d.after_json, '$.result'), 'ok') NOT IN (${ERRORS.map(() => '?').join(',')})
         AND NOT EXISTS (SELECT 1 FROM hypotheses h WHERE h.deviation_id = d.id)
       ORDER BY d.created_at, d.id`,
    )
    .all(portal, ...ERRORS) as WaitingRow[];
}

const membersOf = (raw: Raw, screen: string): string[] =>
  (
    raw
      .prepare(
        'SELECT state_id FROM screen_members WHERE screen_id = ? AND to_model_version IS NULL',
      )
      .all(screen) as { state_id: string }[]
  ).map((r) => r.state_id);

/** The walk that repeats one observation: its journey up to it, its persona and inputs. */
function walkOf(
  raw: Raw,
  portal: string,
  visit: VisitContext,
  purpose: string,
): VisitReplay | null {
  const o = raw
    .prepare(
      `SELECT v.journey_id, v.seq, v.created_at, v.run_id, r.persona_id, r.environment
       FROM observations v JOIN runs r ON r.id = v.run_id WHERE v.id = ?`,
    )
    .get(visit.id) as
    | {
        journey_id: string | null;
        seq: number | null;
        created_at: string;
        run_id: string;
        persona_id: string;
        environment: string;
      }
    | undefined;
  if (!o?.journey_id || o.seq === null) return null;
  const path = journeyPath(raw, o.journey_id, o.seq);
  if (!path) return null;
  const inputs = Object.fromEntries(
    Object.entries(
      referenceOf(raw, { journey_id: o.journey_id, seq: o.seq, created_at: o.created_at }),
    )
      .filter(([name]) => name.startsWith('input.'))
      .map(([name, v]) => [name, String(v)]),
  );
  const login =
    raw
      .prepare("SELECT 1 FROM observations WHERE run_id = ? AND via = 'login' LIMIT 1")
      .get(o.run_id) !== undefined;
  return {
    portal,
    persona: o.persona_id,
    environment: o.environment,
    ...path,
    inputs,
    login,
    purpose,
  };
}

const stateOf = (raw: Raw, visitId: string): string =>
  (
    raw.prepare('SELECT state_id FROM observations WHERE id = ?').get(visitId) as {
      state_id: string;
    }
  ).state_id;

/**
 * Plans for the waiting R4 and R5 deviations, at most `limit` replays in all (each needs up to
 * two R4 replays and three R5 replays).
 */
/** R4's two walks when the audiences differ and both visits can be walked again; else null. */
function r4Walks(
  raw: Raw,
  portal: string,
  current: VisitContext,
  reference: VisitContext | null,
): PendingContextReplay['r4'] {
  if (!reference || reference.audience === current.audience) return null;
  const ref = walkOf(raw, portal, reference, 'rule R4: replay as the reference visit (headless)');
  const cur = walkOf(raw, portal, current, 'rule R4: replay as the deviating visit (headless)');
  if (!ref || !cur) return null;
  return {
    reference: ref,
    current: cur,
    referenceState: stateOf(raw, reference.id),
    currentState: stateOf(raw, current.id),
  };
}

/** One deviation's plan; null when its visit cannot be walked again. */
function planOf(raw: Raw, portal: string, d: WaitingRow): PendingContextReplay | null {
  const [current, reference] = visitPair(raw, keyOf(d), membersOf(raw, d.screen_id));
  if (!current) return null;
  const r5 = walkOf(raw, portal, current, 'rule R5: replay a page that differed (headless)');
  if (!r5) return null;
  return { deviationId: d.id, r4: r4Walks(raw, portal, current, reference), r5 };
}

const keyOf = (d: WaitingRow) => ({
  kind: d.kind,
  ...(d.state_id ? { state: d.state_id } : {}),
  ...(d.element_key ? { elementKey: d.element_key } : {}),
});

export function pendingContextReplays(
  raw: Raw,
  portal: string,
  opts: { limit?: number } = {},
): PendingContextReplay[] {
  let budget = opts.limit ?? MODEL_DEFAULTS.replayBudget;
  const out: PendingContextReplay[] = [];
  for (const d of waitingContext(raw, portal)) {
    const plan = planOf(raw, portal, d);
    if (!plan) continue;
    const cost = (plan.r4 ? 2 : 0) + R5_REPLAYS;
    if (cost > budget) break;
    budget -= cost;
    out.push(plan);
  }
  return out;
}

/** Where a replay landed, and the flags its last observation recorded. */
export function replayLanding(raw: Raw, outcome: ReplayResult): ReplayLanding {
  if (outcome.status !== 'reached') return { stateId: null, flags: {} };
  const o = raw
    .prepare(
      'SELECT flags_json FROM observations WHERE run_id = ? AND state_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
    )
    .get(outcome.runId, outcome.stateId) as { flags_json: string } | undefined;
  return {
    stateId: outcome.stateId,
    flags: o ? (JSON.parse(o.flags_json) as Record<string, string>) : {},
  };
}

/**
 * The flag that separates alternating landings: present on every landing, one value per landed
 * state, a different value for each state. Session ids differ on every replay, so they never do.
 */
export function separatingFlag(landings: readonly ReplayLanding[]): string | null {
  const reached = landings.filter(
    (l): l is ReplayLanding & { stateId: string } => l.stateId !== null,
  );
  if (new Set(reached.map((l) => l.stateId)).size < 2) return null;
  const names = [...new Set(reached.flatMap((l) => Object.keys(l.flags)))].sort();
  for (const name of names) {
    if (!reached.every((l) => name in l.flags)) continue;
    const valueOf = new Map<string, string>();
    const stateOfValue = new Map<string, string>();
    const consistent = reached.every((l) => {
      const v = l.flags[name]!;
      const seen = valueOf.get(l.stateId);
      const owner = stateOfValue.get(v);
      valueOf.set(l.stateId, v);
      stateOfValue.set(v, l.stateId);
      return (seen === undefined || seen === v) && (owner === undefined || owner === l.stateId);
    });
    if (consistent) return name;
  }
  return null;
}

export interface ContextResults {
  /** R4: the landings of the reference and the deviating walk (absent when R4 did not run). */
  r4?: { reference: ReplayLanding; current: ReplayLanding };
  /** R5: the landings of the repeated walk (absent when R4 decided first). */
  r5?: readonly ReplayLanding[];
}

/**
 * What the replays tell the rules: R4 whether each walk landed on its own visit's state, R5 the
 * landed states and the flag that separates them.
 */
function replaysOf(plan: PendingContextReplay, results: ContextResults) {
  const r4 =
    plan.r4 && results.r4
      ? {
          reference: results.r4.reference.stateId === plan.r4.referenceState,
          current: results.r4.current.stateId === plan.r4.currentState,
        }
      : {};
  if (!results.r5) return r4;
  const repeated = results.r5.map((l) => l.stateId).filter((s): s is string => s !== null);
  return { ...r4, repeated, separatingFlag: separatingFlag(results.r5) };
}

function deviationOf(d: WaitingRow): Deviation {
  return {
    kind: d.kind,
    subjectKey: d.subject_key,
    screen: d.screen_id,
    ...(d.state_id ? { state: d.state_id } : {}),
    ...(d.after_json ? { after: JSON.parse(d.after_json) as Deviation['after'] } : {}),
    ...(d.before_json ? { before: JSON.parse(d.before_json) as Deviation['before'] } : {}),
    ...(d.element_key ? { elementKey: d.element_key } : {}),
    ...(d.action_kind ? { actionKind: d.action_kind } : {}),
  };
}

/** The hypothesis written; `next: 'R5'` when R4 did not decide; `waiting` when nothing decided. */
export type ContextVerdict =
  { hypothesis: string } | { next: 'R5' } | { waiting: true } | { open: true };

/** Classify a waiting deviation with its replays, and write what the rules decided. */
export function resolveContextReplays(
  raw: Raw,
  portal: string,
  plan: PendingContextReplay,
  results: ContextResults,
  now = nowIso(),
): ContextVerdict {
  const d = waitingContext(raw, portal).find((x) => x.id === plan.deviationId);
  if (!d) return { waiting: true };
  const replays = replaysOf(plan, results);
  if ('repeated' in replays && replays.repeated.length === 0) return { waiting: true }; // all diverged
  const deviation = deviationOf(d);
  const decision = classify({
    kind: d.kind,
    result: deviation.after?.result ?? 'ok',
    buildChanged: false,
    schemaChanged: false,
    contextDiffers: plan.r4 !== null,
    sameEpochAndAudience: plan.r4 === null,
    presentForOtherAudience: false,
    newActionSameScreens: false,
    replays,
  });
  if (decision.decision === 'replay')
    return decision.rule === 'R5' && !results.r5 ? { next: 'R5' } : { waiting: true };
  if (decision.decision === 'ambiguous') {
    raw.prepare("UPDATE deviations SET status = 'open' WHERE id = ?").run(d.id); // the agent's queue
    return { open: true };
  }
  const key = hypothesisKeys(raw, portal)();
  raw.transaction(() => {
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
  })();
  return { hypothesis: key };
}
