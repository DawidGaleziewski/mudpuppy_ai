import { newId, nowIso } from '@pathfinder/core';
import type { ServerContext } from '../context.js';

/** The executed, observed transition that already reached a link target. */
interface SeenEdge {
  id: string;
  to_state: string;
  evidence_ref: string;
  stabilization: 'settled' | 'never_stabilized';
}

/** A pending frontier row as `getNextFrontierItem` reads it. */
interface FrontierRow {
  id: string;
  run_id: string;
  state_id: string;
  action_id: string | null;
  action_json: string;
  safety_class: string;
}

interface LinkAction {
  role?: string;
  input?: string;
  form?: unknown;
  target_url?: string;
  page_url?: string;
}

/**
 * The target of a plain link item: role `link`, no form, not a fill/check/select control, with the
 * absolute http(s) `target_url` the server resolved when it issued the action (spec 013 R3).
 */
export function linkTarget(row: Pick<FrontierRow, 'action_id' | 'action_json'>): string | null {
  if (!row.action_id) return null;
  let a: LinkAction;
  try {
    a = JSON.parse(row.action_json) as LinkAction;
  } catch {
    return null;
  }
  if (a.role !== 'link' || a.input || a.form || typeof a.target_url !== 'string') return null;
  return /^https?:\/\//.test(a.target_url) ? a.target_url : null;
}

/**
 * Settle a link item whose target this run already reached by an executed, observed transition:
 * record an `inferred` edge to the same state (that transition's evidence) and mark the item
 * `done` with `same_target: <edge id>`. Returns false, changing nothing, when the item must be
 * executed: not a plain link, or no successful transition to its target yet (spec 013 US2, R2, R4).
 */
export async function inferSameTarget(ctx: ServerContext, row: FrontierRow): Promise<boolean> {
  const target = linkTarget(row);
  if (target === null) return false;
  const seen = ctx.raw
    .prepare(
      `SELECT id, to_state, evidence_ref, stabilization FROM edges
       WHERE run_id = ? AND status = 'executed' AND confidence = 'observed'
         AND to_state IS NOT NULL AND json_extract(action_json, '$.target_url') = ?
       ORDER BY id LIMIT 1`,
    )
    .get(row.run_id, target) as SeenEdge | undefined;
  if (!seen) return false;
  // The edge carries the item's own action (locators, snapshot) like an executed one, without
  // the page it was found on (record-transition's shape).
  const action = JSON.parse(row.action_json) as Record<string, unknown>;
  delete action.page_url;
  const edgeId = newId();
  const ts = nowIso();
  await ctx.db.transaction().execute(async (tx) => {
    await tx
      .insertInto('edges')
      .values({
        id: edgeId,
        run_id: row.run_id,
        from_state: row.state_id,
        to_state: seen.to_state,
        action_json: JSON.stringify(action),
        safety_class: row.safety_class as 'read',
        status: 'executed',
        evidence_ref: seen.evidence_ref,
        confidence: 'inferred',
        error: null,
        stabilization: seen.stabilization,
        created_at: ts,
      })
      .execute();
    await tx
      .updateTable('frontier')
      .set({ status: 'done', reason: `same_target: ${seen.id}`, updated_at: ts })
      .where('id', '=', row.id)
      .execute();
  });
  ctx.tracer.event('frontier_infer', {
    frontier_id: row.id,
    edge_id: edgeId,
    same_as_edge_id: seen.id,
    to_state: seen.to_state,
  });
  return true;
}
