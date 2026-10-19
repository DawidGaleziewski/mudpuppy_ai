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
        'SELECT to_status, actor, reason, at FROM hypothesis_events WHERE hypothesis_id = ? ORDER BY at, id',
      )
      .all(hypothesisId) as {
      to_status: HypothesisStatus;
      actor: string;
      reason: string;
      at: string;
    }[]
  ).map((e) => ({ to: e.to_status, actor: e.actor, reason: e.reason, at: e.at }));
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
        'INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        newId(),
        h.id,
        from,
        to,
        d.actor,
        d.decision === 'overturn' ? `overturned: ${d.reason}` : d.reason,
        at,
      );
    return to;
  })();
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
  raw
    .prepare(
      `INSERT INTO state_pair_labels (portal_id, state_a, state_b, label, nd_kind, labelled_by, labelled_at, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (state_a, state_b) DO UPDATE SET label = excluded.label, nd_kind = excluded.nd_kind,
         labelled_by = excluded.labelled_by, labelled_at = excluded.labelled_at, reason = excluded.reason`,
    )
    .run(
      l.portal,
      a,
      b,
      l.label,
      l.label === 'near_duplicate' ? (l.ndKind ?? null) : null,
      l.actor,
      l.now ?? nowIso(),
      l.reason ?? null,
    );
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
