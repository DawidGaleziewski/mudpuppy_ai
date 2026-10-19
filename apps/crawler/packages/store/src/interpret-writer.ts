/**
 * Interpretation (spec 039 design § 8, § 10): after a new model version, its deviations from the
 * previous one, classified by rules R1–R8 into hypotheses. Derived facts are confirmed by the
 * reconciler (constitution 6.0.0); the rest wait for a person, ask for replays (planner marks for
 * the headless driver), or stay open deviations in the agent's queue. Runs inside the reconcile
 * transaction.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { newId } from '@pathfinder/core';
import {
  claimHash,
  classify,
  deviationsBetween,
  type Deviation,
  type ModelSnapshot,
  type RuleContext,
  type RuleDecision,
} from '@pathfinder/model';

type Raw = BetterSqlite3.Database;

const K = (...parts: string[]): string => parts.join('\u0000');

/** The portal's current model as `deviationsBetween` compares it. */
export function modelSnapshot(raw: Raw, portal: string): ModelSnapshot {
  const screens = new Map<string, string[]>();
  for (const r of raw
    .prepare(
      `SELECT m.screen_id, m.state_id FROM screen_members m JOIN model_screens s ON s.id = m.screen_id
       WHERE s.portal_id = ? AND m.to_model_version IS NULL AND s.status = 'active'`,
    )
    .all(portal) as { screen_id: string; state_id: string }[])
    screens.set(r.screen_id, [...(screens.get(r.screen_id) ?? []), r.state_id]);
  const classes = new Map<string, string>();
  for (const r of raw
    .prepare(
      `SELECT a.screen_id, a.element_key, a.kind, a.status FROM action_classes a
       JOIN model_screens s ON s.id = a.screen_id WHERE s.portal_id = ?`,
    )
    .all(portal) as { screen_id: string; element_key: string; kind: string; status: string }[])
    classes.set(K(r.screen_id, r.element_key, r.kind), r.status);
  const transitions = new Set<string>();
  for (const r of raw
    .prepare(
      `SELECT t.from_screen_id, a.element_key, a.kind, t.to_screen_id, t.result FROM model_transitions t
       JOIN action_classes a ON a.id = t.action_class_id JOIN model_screens s ON s.id = t.from_screen_id
       WHERE s.portal_id = ?`,
    )
    .all(portal) as {
    from_screen_id: string;
    element_key: string;
    kind: string;
    to_screen_id: string | null;
    result: string;
  }[])
    transitions.add(K(r.from_screen_id, r.element_key, r.kind, r.to_screen_id ?? '', r.result));
  return { screens, classes, transitions };
}

interface VisitContext {
  builds: string;
  audience: string;
  at: string;
}

/** The builds (sorted `scope=build`) and audience of a visit. */
function visitContext(raw: Raw, visitId: string): VisitContext | null {
  const v = raw
    .prepare(
      `SELECT v.created_at AS at, r.persona_id || '@' || r.environment AS audience,
         (SELECT group_concat(x, '&') FROM (SELECT b.scope || '=' || b.id AS x FROM observation_builds ob
            JOIN builds b ON b.id = ob.build_id WHERE ob.page_visit_id = v.id ORDER BY x)) AS builds
       FROM page_visits v JOIN runs r ON r.id = v.run_id WHERE v.id = ?`,
    )
    .get(visitId) as { at: string; audience: string; builds: string | null } | undefined;
  return v ? { at: v.at, audience: v.audience, builds: v.builds ?? '' } : null;
}

/** The latest visit of any of `states`, optionally before `before`. */
function latestVisit(raw: Raw, states: readonly string[], before?: string): string | null {
  if (states.length === 0) return null;
  const marks = states.map(() => '?').join(',');
  const row = raw
    .prepare(
      `SELECT id FROM page_visits WHERE state_id IN (${marks}) ${before ? 'AND created_at < ?' : ''}
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get(...states, ...(before ? [before] : [])) as { id: string } | undefined;
  return row?.id ?? null;
}

/**
 * The deviating visit and its reference (design § 8.1): a new member's first visit against the
 * latest earlier visit of another member; otherwise the screen's latest visit against the one
 * before it.
 */
function visitPair(
  raw: Raw,
  d: Deviation,
  members: readonly string[],
): [VisitContext | null, VisitContext | null] {
  if (d.kind === 'new_member' && d.state) {
    const first = raw
      .prepare('SELECT id FROM page_visits WHERE state_id = ? ORDER BY created_at, id LIMIT 1')
      .get(d.state) as { id: string } | undefined;
    const current = first ? visitContext(raw, first.id) : null;
    const ref = latestVisit(
      raw,
      members.filter((m) => m !== d.state),
      current?.at,
    );
    return [current, ref ? visitContext(raw, ref) : null];
  }
  const latest = latestVisit(raw, members);
  const current = latest ? visitContext(raw, latest) : null;
  const ref = current ? latestVisit(raw, members, current.at) : null;
  return [current, ref ? visitContext(raw, ref) : null];
}

/** The evidence a rule looks at for one deviation (design § 8.1: the reference observation). */
function contextOf(
  raw: Raw,
  d: Deviation,
  next: ModelSnapshot,
  deviations: readonly Deviation[],
): RuleContext {
  const members = next.screens.get(d.screen) ?? [];
  const [current, reference] = visitPair(raw, d, members);
  const buildChanged =
    current !== null && reference !== null && current.builds !== reference.builds;
  const contextDiffers =
    current !== null && reference !== null && current.audience !== reference.audience;
  // R6: another action between the same two screens appeared in this version.
  const targets = (screen: string, key: string, kind: string) =>
    [...next.transitions]
      .map((t) => t.split('\u0000'))
      .filter(([s, e, k]) => s === screen && e === key && k === kind)
      .map(([, , , to]) => to);
  const missingTargets =
    d.elementKey && d.actionKind ? targets(d.screen, d.elementKey, d.actionKind) : [];
  const newActionSameScreens =
    d.kind === 'missing_action' &&
    deviations.some(
      (o) =>
        o.kind === 'new_action' &&
        o.screen === d.screen &&
        o.elementKey !== undefined &&
        o.actionKind !== undefined &&
        targets(o.screen, o.elementKey, o.actionKind).some((t) => missingTargets.includes(t)),
    );
  return {
    kind: d.kind,
    result: d.after?.result ?? 'ok',
    buildChanged,
    schemaChanged: false,
    contextDiffers,
    sameEpochAndAudience: !buildChanged && !contextDiffers,
    presentForOtherAudience: false,
    newActionSameScreens,
  };
}

const CLAIMS: Record<string, (d: Deviation) => string> = {
  structural_drift: (d) =>
    `Screen ${d.screen} changed with a new release (${d.kind.replace('_', ' ')}).`,
  context_variant: (d) =>
    `Screen ${d.screen} differs for another persona or input (${d.kind.replace('_', ' ')}).`,
  removed: (d) => `The action ${d.elementKey ?? ''} of screen ${d.screen} was removed.`,
  replaces: (d) => `A new action on screen ${d.screen} replaces ${d.elementKey ?? ''}.`,
  flaky: (d) => `The error on screen ${d.screen} is flaky: a replay succeeded.`,
  deterministic_error: (d) =>
    `The error on screen ${d.screen} happens every time for these inputs.`,
  backend_drift: (d) => `The backend behind screen ${d.screen} changed (same frontend build).`,
  ab_test: (d) => `Screen ${d.screen} shows an A/B test.`,
  nondeterministic: (d) => `Screen ${d.screen} answers differently to the same inputs.`,
  decision_point: (d) =>
    `${d.elementKey ?? 'An action'} on screen ${d.screen} leads to different screens depending on data.`,
  decision_drift: (d) => `A business rule decided on screen ${d.screen} changed.`,
};

export interface InterpretStats {
  deviations: number;
  derived: number;
  forPerson: number;
  replays: number;
  open: number;
}

/** Record the deviations of a new model version and classify them. Returns what it wrote. */
export function interpretVersion(
  raw: Raw,
  portal: string,
  versionId: string,
  prev: ModelSnapshot,
  next: ModelSnapshot,
  now: string,
): InterpretStats {
  const stats: InterpretStats = { deviations: 0, derived: 0, forPerson: 0, replays: 0, open: 0 };
  if (prev.screens.size === 0) return stats; // the first version: everything is new, nothing deviates
  const found = deviationsBetween(prev, next);
  const nextKey = hypothesisKeys(raw, portal);
  for (const d of found) {
    const existing = raw
      .prepare('SELECT id FROM deviations WHERE portal_id = ? AND kind = ? AND subject_key = ?')
      .get(portal, d.kind, d.subjectKey) as { id: string } | undefined;
    if (existing) {
      raw
        .prepare(
          'INSERT OR IGNORE INTO deviation_occurrences (deviation_id, model_version_id) VALUES (?, ?)',
        )
        .run(existing.id, versionId);
      continue;
    }
    const decision = classify(contextOf(raw, d, next, found));
    const id = newId();
    raw
      .prepare(
        `INSERT INTO deviations (id, portal_id, model_version_id, kind, subject_key, screen_id, state_id,
           action_class_id, before_json, after_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        portal,
        versionId,
        d.kind,
        d.subjectKey,
        d.screen,
        d.state ?? null,
        classId(raw, d),
        d.before ? JSON.stringify(d.before) : null,
        d.after ? JSON.stringify(d.after) : null,
        statusFor(decision),
        now,
      );
    stats.deviations += 1;
    if (decision.decision === 'hypothesis') {
      writeHypothesis(raw, portal, versionId, id, d, decision, nextKey(), now);
      if (decision.derived) stats.derived += 1;
      else stats.forPerson += 1;
    } else if (decision.decision === 'replay') stats.replays += 1;
    else stats.open += 1;
  }
  return stats;
}

function statusFor(d: RuleDecision): 'open' | 'waiting_test' | 'explained' {
  if (d.decision === 'replay') return 'waiting_test';
  if (d.decision === 'hypothesis' && d.derived) return 'explained';
  return 'open';
}

function classId(raw: Raw, d: Deviation): string | null {
  if (!d.elementKey || !d.actionKind) return null;
  const r = raw
    .prepare('SELECT id FROM action_classes WHERE screen_id = ? AND element_key = ? AND kind = ?')
    .get(d.screen, d.elementKey, d.actionKind) as { id: string } | undefined;
  return r?.id ?? null;
}

function hypothesisKeys(raw: Raw, portal: string): () => string {
  const max = raw
    .prepare('SELECT max(CAST(substr(key, 3) AS INTEGER)) AS n FROM hypotheses WHERE portal_id = ?')
    .get(portal) as { n: number | null };
  let n = max.n ?? 0;
  return () => `H-${String(++n).padStart(4, '0')}`;
}

function writeHypothesis(
  raw: Raw,
  portal: string,
  versionId: string,
  deviationId: string,
  d: Deviation,
  decision: Extract<RuleDecision, { decision: 'hypothesis' }>,
  key: string,
  now: string,
): void {
  const claimJson = {
    deviation: d.subjectKey,
    kind: d.kind,
    before: d.before ?? null,
    after: d.after ?? null,
  };
  const id = newId();
  raw
    .prepare(
      `INSERT INTO hypotheses (id, key, portal_id, kind, claim, claim_json, claim_hash, origin, rule, derived,
         confidence, deviation_id, model_version_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'rule', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      key,
      portal,
      decision.kind,
      (CLAIMS[decision.kind] ?? ((x: Deviation) => `${decision.kind} on screen ${x.screen}.`))(d),
      JSON.stringify(claimJson),
      claimHash(decision.kind, claimJson),
      decision.rule,
      decision.derived ? 1 : 0,
      decision.derived ? 'inferred' : 'needs_confirmation',
      deviationId,
      versionId,
      now,
    );
  const ref = newId();
  raw.prepare('INSERT INTO entity_refs (id, screen_id) VALUES (?, ?)').run(ref, d.screen);
  raw
    .prepare(
      "INSERT INTO hypothesis_evidence (hypothesis_id, ref_id, role) VALUES (?, ?, 'supports')",
    )
    .run(id, ref);
  raw
    .prepare(
      `INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason, at)
       VALUES (?, ?, NULL, ?, 'reconciler', ?, ?)`,
    )
    .run(
      newId(),
      id,
      decision.derived ? 'confirmed' : 'proposed',
      decision.derived
        ? `derived by rule ${decision.rule}${decision.note ? `: ${decision.note}` : ''}`
        : `waiting for a person (rule ${decision.rule})${decision.note ? `: ${decision.note}` : ''}`,
      now,
    );
}
