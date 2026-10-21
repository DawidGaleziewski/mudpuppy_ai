import type { BaContext } from '../../context.js';
import { sessionRunIds } from './common.js';

/** An evidence link of the previous revision, copied as it was onto the new one (same ref). */
export interface CarriedLink {
  ref_id: string;
  run_id: string;
  note: string | null;
}

/**
 * The previous revision's links to runs outside this session. A session may only cite its own
 * runs, so without this a revision would silently drop older evidence (spec 004 F-16). Links to
 * the session's runs are not carried: the BA sends those itself and may leave one out. A carried
 * link can never double one the revision sends, since its run is not one the session may cite.
 */
export function outsideSessionLinks(
  ctx: BaContext,
  recordId: string,
  previousRev: number,
  sessionId: string,
): CarriedLink[] {
  const inSession = new Set(sessionRunIds(ctx, sessionId));
  const rows = ctx.raw
    .prepare(
      `SELECT l.ref_id, l.run_id, l.note
       FROM doc_evidence_links l JOIN doc_revisions rev ON rev.id = l.revision_id
       WHERE rev.record_id = ? AND rev.rev_no = ? AND l.run_id IS NOT NULL
       ORDER BY l.rowid`,
    )
    .all(recordId, previousRev) as CarriedLink[];
  return rows.filter((l) => !inSession.has(l.run_id));
}
