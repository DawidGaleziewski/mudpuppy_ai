/**
 * Overturned stays overturned (R-87, owner 2026-10-23; designer gap G1): when a person overturned
 * a fact a rule derived ("explained automatically"), the same rule never explains the same kind of
 * change on that screen (and element) the same way again on its own: the next such explanation
 * waits for a person, with a note naming the overturn. Undoing the overturn lifts it, since the
 * overturn is then no longer the fact's latest event.
 */
import type BetterSqlite3 from 'better-sqlite3';
import type { Deviation, RuleDecision } from '@mudpuppy/model';

type Raw = BetterSqlite3.Database;

/** The person's overturn standing for this rule, kind, screen and element; null when none. */
export function standingOverturn(
  raw: Raw,
  portal: string,
  d: Pick<Deviation, 'kind' | 'screen' | 'elementKey'>,
  decision: { kind: string; rule: string },
): { actor: string; reason: string } | null {
  const row = raw
    .prepare(
      `SELECT e.actor, e.reason FROM hypotheses h
         JOIN deviations dv ON dv.id = h.deviation_id
         LEFT JOIN action_classes a ON a.id = dv.action_class_id
         JOIN hypothesis_events e ON e.hypothesis_id = h.id
       WHERE h.portal_id = ? AND h.rule = ? AND h.kind = ? AND h.derived = 1
         AND dv.screen_id = ? AND dv.kind = ? AND coalesce(a.element_key, '') = ?
         AND e.id = (SELECT x.id FROM hypothesis_events x WHERE x.hypothesis_id = h.id
                     ORDER BY x.at DESC, x.id DESC LIMIT 1)
         AND e.to_status = 'rejected' AND e.reason LIKE 'overturned:%'
       ORDER BY e.at DESC LIMIT 1`,
    )
    .get(portal, decision.rule, decision.kind, d.screen, d.kind, d.elementKey ?? '') as
    { actor: string; reason: string } | undefined;
  return row ? { actor: row.actor, reason: row.reason.replace(/^overturned:\s*/, '') } : null;
}

/** A rule's decision, with a derived fact turned into one for a person where an overturn stands. */
export function guardOverturned(
  raw: Raw,
  portal: string,
  d: Pick<Deviation, 'kind' | 'screen' | 'elementKey'>,
  decision: RuleDecision,
): RuleDecision {
  if (decision.decision !== 'hypothesis' || !decision.derived) return decision;
  const o = standingOverturn(raw, portal, d, decision);
  if (!o) return decision;
  return {
    ...decision,
    derived: false,
    note: `${o.actor} overturned the same explanation here before ("${o.reason}"): a person decides`,
  };
}
