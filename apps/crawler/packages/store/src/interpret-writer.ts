/**
 * Interpretation (spec 039 design § 8, § 10): after a new model version, its deviations from the
 * previous one, classified by rules R1–R8 into hypotheses. Derived facts are confirmed by the
 * reconciler (constitution 6.0.0); the rest wait for a person, ask for replays (planner marks for
 * the headless driver), or stay open deviations in the agent's queue. Runs inside the reconcile
 * transaction.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { newId } from '@mudpuppy/core';
import {
  claimHash,
  classify,
  deviationsBetween,
  type Deviation,
  type ModelSnapshot,
  type RuleContext,
  type RuleDecision,
} from '@mudpuppy/model';
import { visitPair } from './deviation-visits.js';

type Raw = BetterSqlite3.Database;

const K = (...parts: string[]): string => parts.join('\u0000');

/**
 * The portal's current model as `deviationsBetween` compares it. A transition first seen as a
 * form probe's refused input or injected fault is the probe's own doing, not a change of the
 * portal: it stays out (F-58@039).
 */
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
       WHERE s.portal_id = ? AND NOT EXISTS (SELECT 1 FROM probe_outcomes p
         WHERE p.transition_id = t.first_seen_transition_id
           AND (p.fault IS NOT NULL OR p.outcome_kind IN ('validation', 'technical')))`,
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

/** New actions recorded on `screen` by earlier versions, as deviations name them. */
function earlierNewActions(raw: Raw, screen: string): Deviation[] {
  const rows = raw
    .prepare(
      `SELECT dv.subject_key, a.element_key, a.kind FROM deviations dv
       JOIN action_classes a ON a.id = dv.action_class_id
       WHERE dv.kind = 'new_action' AND dv.screen_id = ?`,
    )
    .all(screen) as { subject_key: string; element_key: string; kind: string }[];
  return rows.map((r) => ({
    kind: 'new_action',
    subjectKey: r.subject_key,
    screen,
    elementKey: r.element_key,
    actionKind: r.kind,
  }));
}

/**
 * The evidence a rule looks at for one deviation (design § 8.1: the reference observation), and
 * for a missing action, the new action that may replace it.
 */
function contextOf(
  raw: Raw,
  d: Deviation,
  next: ModelSnapshot,
  deviations: readonly Deviation[],
): { context: RuleContext; replacement: Deviation | undefined } {
  const members = next.screens.get(d.screen) ?? [];
  const [current, reference] = visitPair(raw, d, members);
  const buildChanged =
    current !== null && reference !== null && current.builds !== reference.builds;
  const contextDiffers =
    current !== null && reference !== null && current.audience !== reference.audience;
  // R6: another action between the same two screens appeared in this epoch: in this version, or
  // in an earlier one (an action goes missing only after two runs miss it, a version or more after
  // its replacement appeared, F-23@039).
  const targets = (screen: string, key: string, kind: string) =>
    [...next.transitions]
      .map((t) => t.split('\u0000'))
      .filter(([s, e, k]) => s === screen && e === key && k === kind)
      .map(([, , , to]) => to);
  const missingTargets =
    d.elementKey && d.actionKind ? targets(d.screen, d.elementKey, d.actionKind) : [];
  const newActions = [
    ...deviations.filter((o) => o.kind === 'new_action' && o.screen === d.screen),
    ...earlierNewActions(raw, d.screen),
  ];
  const replacement =
    d.kind === 'missing_action'
      ? newActions.find(
          (o) =>
            o.elementKey !== undefined &&
            o.actionKind !== undefined &&
            o.elementKey !== d.elementKey &&
            targets(o.screen, o.elementKey, o.actionKind).some((t) => missingTargets.includes(t)),
        )
      : undefined;
  const context: RuleContext = {
    kind: d.kind,
    result: d.after?.result ?? 'ok',
    buildChanged,
    schemaChanged: false,
    contextDiffers,
    sameEpochAndAudience: !buildChanged && !contextDiffers,
    presentForOtherAudience: false,
    newActionSameScreens: replacement !== undefined,
  };
  return { context, replacement };
}

/**
 * The deviation as a claim names it: the screen by its key and title, the action by its role and
 * label (`button "Dalej"`), never by ids a reader cannot look up (F-58@039).
 */
function readable(raw: Raw, d: Deviation): Deviation {
  const s = raw.prepare('SELECT key, title FROM model_screens WHERE id = ?').get(d.screen) as
    { key: string; title: string | null } | undefined;
  const [role, label] = d.elementKey?.split('|') ?? [];
  return {
    ...d,
    screen: s ? `${s.key}${s.title ? ` "${s.title}"` : ''}` : d.screen,
    elementKey: role && label ? `${role} "${label}"` : d.elementKey,
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
  {
    versionId,
    prev,
    next,
    now,
  }: { versionId: string; prev: ModelSnapshot; next: ModelSnapshot; now: string },
): InterpretStats {
  const stats: InterpretStats = { deviations: 0, derived: 0, forPerson: 0, replays: 0, open: 0 };
  if (prev.screens.size === 0) return stats; // the first version: everything is new, nothing deviates
  const found = deviationsBetween(prev, next);
  const nextKey = hypothesisKeys(raw, portal);
  const replacements: Deviation[] = [];
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
    const { context, replacement } = contextOf(raw, d, next, found);
    const decision = classify(context);
    if (decision.decision === 'hypothesis' && decision.kind === 'replaces' && replacement)
      replacements.push(replacement);
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
      writeHypothesis(raw, {
        portal,
        versionId,
        deviationId: id,
        deviation: d,
        decision,
        key: nextKey(),
        now,
      });
      if (decision.derived) stats.derived += 1;
      else stats.forPerson += 1;
    } else if (decision.decision === 'replay') stats.replays += 1;
    else stats.open += 1;
  }
  // A rename is one change: the `replaces` fact explains the new element's deviations too.
  const explain = raw.prepare(
    `UPDATE deviations SET status = 'explained' WHERE portal_id = ? AND kind = 'new_action' AND status = 'open'
       AND action_class_id IN (SELECT id FROM action_classes WHERE screen_id = ? AND element_key = ?)`,
  );
  for (const r of replacements) explain.run(portal, r.screen, r.elementKey);
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

/** The next free hypothesis keys of a portal (`H-0001`, …), one per call. */
export function hypothesisKeys(raw: Raw, portal: string): () => string {
  const max = raw
    .prepare('SELECT max(CAST(substr(key, 3) AS INTEGER)) AS n FROM hypotheses WHERE portal_id = ?')
    .get(portal) as { n: number | null };
  let n = max.n ?? 0;
  return () => `H-${String(++n).padStart(4, '0')}`;
}

/** A rule's hypothesis on one deviation, with its evidence and first event (derived = confirmed). */
export function writeHypothesis(
  raw: Raw,
  h: {
    portal: string;
    versionId: string;
    deviationId: string;
    deviation: Deviation;
    decision: Extract<RuleDecision, { decision: 'hypothesis' }>;
    key: string;
    now: string;
  },
): void {
  const { portal, versionId, deviationId, deviation: d, decision, key, now } = h;
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
      (CLAIMS[decision.kind] ?? ((x: Deviation) => `${decision.kind} on screen ${x.screen}.`))(
        readable(raw, d),
      ),
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
