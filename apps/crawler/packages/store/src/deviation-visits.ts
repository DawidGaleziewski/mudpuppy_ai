/**
 * The deviating visit and its reference (spec 039 design § 8.1), for the rules (interpret-writer)
 * and for the replays that answer them (context-replays, spec 046): the builds and audience of
 * each, and the visit itself to walk again.
 */
import type BetterSqlite3 from 'better-sqlite3';
import type { Deviation } from '@mudpuppy/model';

type Raw = BetterSqlite3.Database;

export interface VisitContext {
  /** The observation. */
  id: string;
  builds: string;
  audience: string;
  at: string;
}

/** The builds (sorted `scope=build`) and audience of a visit. */
export function visitContext(raw: Raw, visitId: string): VisitContext | null {
  const v = raw
    .prepare(
      `SELECT v.created_at AS at, r.persona_id || '@' || r.environment AS audience,
         (SELECT group_concat(x, '&') FROM (SELECT b.scope || '=' || b.id AS x FROM observation_builds ob
            JOIN builds b ON b.id = ob.build_id WHERE ob.observation_id = v.id ORDER BY x)) AS builds
       FROM observations v JOIN runs r ON r.id = v.run_id WHERE v.id = ?`,
    )
    .get(visitId) as { at: string; audience: string; builds: string | null } | undefined;
  return v ? { id: visitId, at: v.at, audience: v.audience, builds: v.builds ?? '' } : null;
}

/** The latest visit of any of `states`, optionally before `before`. */
function latestVisit(raw: Raw, states: readonly string[], before?: string): string | null {
  if (states.length === 0) return null;
  const marks = states.map(() => '?').join(',');
  const row = raw
    .prepare(
      `SELECT id FROM observations WHERE state_id IN (${marks}) ${before ? 'AND created_at < ?' : ''}
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get(...states, ...(before ? [before] : [])) as { id: string } | undefined;
  return row?.id ?? null;
}

/** The states among `members` whose page shows the element `key`. */
function withElement(raw: Raw, members: readonly string[], key: string): string[] {
  const has = raw.prepare(
    'SELECT 1 FROM state_components c, json_each(c.element_keys) k WHERE c.state_id = ? AND k.value = ?',
  );
  return members.filter((m) => has.get(m, key) !== undefined);
}

/**
 * The deviating visit and its reference (design § 8.1): a new member's first visit against the
 * latest earlier visit of another member; otherwise the screen's latest visit against the one
 * before it.
 */
export function visitPair(
  raw: Raw,
  d: Pick<Deviation, 'kind' | 'state' | 'elementKey'>,
  members: readonly string[],
): [VisitContext | null, VisitContext | null] {
  if (d.kind === 'new_member' && d.state) {
    const first = raw
      .prepare('SELECT id FROM observations WHERE state_id = ? ORDER BY created_at, id LIMIT 1')
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
  // A missing action against the last page version that still had it: the runs that missed it
  // may all be after the release that removed it (F-23@039).
  const had =
    d.kind === 'missing_action' && d.elementKey ? withElement(raw, members, d.elementKey) : members;
  const ref = current ? latestVisit(raw, had, current.at) : null;
  return [current, ref ? visitContext(raw, ref) : null];
}
