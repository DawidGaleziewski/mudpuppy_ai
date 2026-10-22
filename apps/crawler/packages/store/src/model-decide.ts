/**
 * A person's decisions on the portal model (spec 039 design § 10.3, constitution 6.0.0): confirm,
 * reject or overturn a hypothesis, label a pair of page versions, set a parameter's role. Every
 * decision carries its author and, for hypotheses, its reason; later reconciles treat it as a
 * constraint (labels and roles feed clustering; a rejected claim is never written again).
 */
import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@pathfinder/core';
import {
  LifecycleError,
  statusOf,
  type HypothesisEvent,
  type HypothesisStatus,
} from '@pathfinder/model';

type Raw = BetterSqlite3.Database;

export class ModelDecisionError extends Error {}

function hypothesisOf(raw: Raw, portal: string, key: string): { id: string; derived: number } {
  const h = raw
    .prepare('SELECT id, derived FROM hypotheses WHERE portal_id = ? AND key = ?')
    .get(portal, key) as { id: string; derived: number } | undefined;
  if (!h) throw new ModelDecisionError(`no hypothesis ${key} on portal ${portal}`);
  return h;
}

/** The hypothesis's events in order, as the lifecycle reads them. */
export function hypothesisEvents(raw: Raw, hypothesisId: string): HypothesisEvent[] {
  return (
    raw
      .prepare(
        'SELECT to_status, actor, reason, at, undoes FROM hypothesis_events WHERE hypothesis_id = ? ORDER BY at, id',
      )
      .all(hypothesisId) as {
      to_status: HypothesisStatus;
      actor: string;
      reason: string;
      at: string;
      undoes: string | null;
    }[]
  ).map((e) => ({
    to: e.to_status,
    actor: e.actor,
    reason: e.reason,
    at: e.at,
    ...(e.undoes === null ? {} : { undo: true }),
  }));
}

export type HypothesisDecision = 'confirm' | 'reject' | 'overturn';

/**
 * Record a person's decision. `overturn` rejects a derived fact (the reconciler confirmed it by a
 * rule); `reject` a proposal; `confirm` a proposal or a supported claim. A reason is required.
 */
export function decideHypothesis(
  raw: Raw,
  d: {
    portal: string;
    key: string;
    decision: HypothesisDecision;
    actor: string;
    reason: string;
    /** The command this decision came in; a bulk decision shares one, so one Undo reverts it. */
    decisionId?: string;
    now?: string;
  },
): HypothesisStatus {
  if (!d.reason.trim()) throw new ModelDecisionError('a decision needs a reason');
  if (!d.actor.trim()) throw new ModelDecisionError('a decision needs its author');
  return raw.transaction(() => {
    const h = hypothesisOf(raw, d.portal, d.key);
    const events = hypothesisEvents(raw, h.id);
    const from = statusOf(events);
    const to: HypothesisStatus = d.decision === 'confirm' ? 'confirmed' : 'rejected';
    if (d.decision === 'overturn' && !(h.derived === 1 && from === 'confirmed'))
      throw new ModelDecisionError(`${d.key} is not a derived fact; reject it instead`);
    const at = d.now ?? nowIso();
    try {
      statusOf([...events, { to, actor: d.actor, reason: d.reason, at }]);
    } catch (e) {
      if (e instanceof LifecycleError) throw new ModelDecisionError(`${d.key}: ${e.message}`);
      throw e;
    }
    raw
      .prepare(
        'INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason, at, decision_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        newId(),
        h.id,
        from,
        to,
        d.actor,
        d.decision === 'overturn' ? `overturned: ${d.reason}` : d.reason,
        at,
        d.decisionId ?? null,
      );
    return to;
  })();
}

/**
 * Undo a person's command (designer § 5.4, § 5.8): every hypothesis it decided goes back to the
 * status it had, as new events (nothing is deleted). Refused when anything happened to one of
 * them since, or when the command was already undone: an Undo never hides a later decision.
 */
export function undoDecision(
  raw: Raw,
  u: { portal: string; decisionId: string; actor: string; now?: string },
): { key: string; status: HypothesisStatus }[] {
  if (!u.actor.trim()) throw new ModelDecisionError('an undo needs its author');
  return raw.transaction(() => {
    const decided = raw
      .prepare(
        `SELECT e.id, e.hypothesis_id, e.from_status, h.key FROM hypothesis_events e
           JOIN hypotheses h ON h.id = e.hypothesis_id
         WHERE e.decision_id = ? AND h.portal_id = ? AND e.undoes IS NULL ORDER BY h.key`,
      )
      .all(u.decisionId, u.portal) as {
      id: string;
      hypothesis_id: string;
      from_status: HypothesisStatus | null;
      key: string;
    }[];
    if (decided.length === 0)
      throw new ModelDecisionError(`no decision ${u.decisionId} on portal ${u.portal}`);
    const at = u.now ?? nowIso();
    return decided.map((d) => {
      const latest = raw
        .prepare(
          'SELECT id FROM hypothesis_events WHERE hypothesis_id = ? ORDER BY at DESC, id DESC LIMIT 1',
        )
        .get(d.hypothesis_id) as { id: string };
      if (latest.id !== d.id)
        throw new ModelDecisionError(`${d.key} changed after this decision; it cannot be undone`);
      if (d.from_status === null) throw new ModelDecisionError(`${d.key}: nothing to undo`);
      const events = hypothesisEvents(raw, d.hypothesis_id);
      const reason = `undo by ${u.actor}`;
      try {
        statusOf([...events, { to: d.from_status, actor: u.actor, reason, at, undo: true }]);
      } catch (e) {
        if (e instanceof LifecycleError) throw new ModelDecisionError(`${d.key}: ${e.message}`);
        throw e;
      }
      const current = events[events.length - 1]!.to;
      raw
        .prepare(
          'INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason, at, undoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(newId(), d.hypothesis_id, current, d.from_status, u.actor, reason, at, d.id);
      return { key: d.key, status: d.from_status };
    });
  })();
}

/**
 * A person's Reword of a rule (designer § 7.1): the sentence that goes into the documentation in
 * place of the mined claim. Every wording stays; the latest is in force (`ruleWording`).
 */
export function rewordHypothesis(
  raw: Raw,
  w: { portal: string; key: string; wording: string; actor: string; reason?: string; now?: string },
): void {
  const wording = w.wording.trim();
  if (!wording) throw new ModelDecisionError('a wording needs a sentence');
  if (wording.length > 2000) throw new ModelDecisionError('a wording is at most 2000 characters');
  if (!w.actor.trim()) throw new ModelDecisionError('a wording needs its author');
  const h = hypothesisOf(raw, w.portal, w.key);
  raw
    .prepare(
      'INSERT INTO hypothesis_wordings (id, hypothesis_id, wording, actor, reason, at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(newId(), h.id, wording, w.actor, w.reason?.trim() || null, w.now ?? nowIso());
}

/** A person's sentence for a rule, said in place of the mined one. */
export interface RuleWording {
  wording: string;
  actor: string;
  at: string;
}

/** The wording in force for a hypothesis (a person's latest Reword), or null. */
export function ruleWording(raw: Raw, hypothesisId: string): RuleWording | null {
  const row = raw
    .prepare(
      'SELECT wording, actor, at FROM hypothesis_wordings WHERE hypothesis_id = ? ORDER BY at DESC, id DESC LIMIT 1',
    )
    .get(hypothesisId) as RuleWording | undefined;
  return row ?? null;
}

/** A person's "same screen?" answer for two page versions; a later answer replaces an earlier one. */
export function labelPair(
  raw: Raw,
  l: {
    portal: string;
    a: string;
    b: string;
    label: 'clone' | 'near_duplicate' | 'distinct';
    ndKind?: 'cosmetic' | 'dynamic_data' | 'duplication';
    actor: string;
    reason?: string;
    now?: string;
  },
): void {
  if (l.a === l.b) throw new ModelDecisionError('a pair needs two different page versions');
  const [a, b] = l.a < l.b ? [l.a, l.b] : [l.b, l.a];
  for (const s of [a, b]) {
    const ok = raw.prepare('SELECT 1 FROM states WHERE id = ? AND portal_id = ?').get(s, l.portal);
    if (!ok) throw new ModelDecisionError(`page version ${s} is not on portal ${l.portal}`);
  }
  const row = [
    l.portal,
    a,
    b,
    l.label,
    l.label === 'near_duplicate' ? (l.ndKind ?? null) : null,
    l.actor,
    l.now ?? nowIso(),
    l.reason ?? null,
  ];
  raw.transaction(() => {
    raw
      .prepare(
        `INSERT INTO state_pair_labels (portal_id, state_a, state_b, label, nd_kind, labelled_by, labelled_at, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (state_a, state_b) DO UPDATE SET label = excluded.label, nd_kind = excluded.nd_kind,
           labelled_by = excluded.labelled_by, labelled_at = excluded.labelled_at, reason = excluded.reason`,
      )
      .run(...row);
    // Every answer stays: the latest is the label, the earlier ones are its history (owner, 2026-10-21).
    raw
      .prepare(
        `INSERT INTO state_pair_label_history (id, portal_id, state_a, state_b, label, nd_kind, labelled_by,
           labelled_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(newId(), ...row);
  })();
}

/** Every answer given for a pair of page versions, oldest first. */
export function pairLabelHistory(
  raw: Raw,
  a: string,
  b: string,
): { label: string; ndKind: string | null; by: string; at: string; reason: string | null }[] {
  const [x, y] = a < b ? [a, b] : [b, a];
  return raw
    .prepare(
      `SELECT label, nd_kind AS ndKind, labelled_by AS "by", labelled_at AS "at", reason
       FROM state_pair_label_history WHERE state_a = ? AND state_b = ? ORDER BY labelled_at, id`,
    )
    .all(x, y) as ReturnType<typeof pairLabelHistory>;
}

/** A person's role for a route parameter; it wins over the reconciler's from then on. */
export function setParameterRole(
  raw: Raw,
  r: {
    portal: string;
    routeTemplate: string;
    param: string;
    role: 'identity' | 'data' | 'ignored';
    now?: string;
  },
): void {
  if (!/^(path:\d+|query:.+)$/.test(r.param))
    throw new ModelDecisionError(`parameter ${r.param}: use path:<index> or query:<name>`);
  raw
    .prepare(
      `INSERT INTO parameter_roles (portal_id, route_template, param, role, decided_by, decided_at)
       VALUES (?, ?, ?, ?, 'person', ?)
       ON CONFLICT (portal_id, route_template, param) DO UPDATE SET role = excluded.role,
         decided_by = 'person', decided_at = excluded.decided_at`,
    )
    .run(r.portal, r.routeTemplate, r.param, r.role, r.now ?? nowIso());
}
