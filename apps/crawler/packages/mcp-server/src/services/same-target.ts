import { newId, nowIso } from '@pathfinder/core';
import type { ServerContext } from '../context.js';

/** The executed, observed transition that already reached a link target. */
export interface SeenEdge {
  id: string;
  to_state: string;
  evidence_ref: string;
  stabilization: 'settled' | 'never_stabilized';
}

/** A pending frontier row as `getNextFrontierItem` reads it. */
export interface FrontierRow {
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

/** A trailing count in a link name: "Koszyk (3)", "Inbox [12]". */
const TRAILING_COUNT = /\s*[([](\d+)[)\]]\s*$/;

/**
 * The name two links must share to be the same link (spec 026 F-04, spec 031 T014): a trailing
 * count only says whether it is zero, so "Koszyk (1)" … "(3)" are one link (all a filled cart;
 * each count was a new item, 16 left pending in the shop eval, F-07@026), while "Koszyk (0)" stays
 * apart from them as the owner decided (an empty cart hides the checkout).
 */
export function linkNameKey(name: string | null): string | null {
  if (name === null) return null;
  const m = TRAILING_COUNT.exec(name);
  if (!m) return name;
  return `${name.slice(0, m.index)} (${Number(m[1]) === 0 ? '0' : 'n'})`;
}

/**
 * Settle a link item whose target this run already reached by an executed, observed transition:
 * record an `inferred` edge to the same state (that transition's evidence) and mark the item
 * `done` with `same_target: <edge id>`. Returns false, changing nothing, when the item must be
 * executed: not a plain link, or no successful transition to its target yet (spec 013 US2, R2, R4).
 * The link's visible name must match too (spec 026 F-04): "Koszyk (1)" after an item was added
 * leads to a different page than the "Koszyk (0)" the run followed, though the URL is the same.
 * Names are compared by {@link linkNameKey}.
 */
export async function inferSameTarget(ctx: ServerContext, row: FrontierRow): Promise<boolean> {
  const target = linkTarget(row);
  if (target === null) return false;
  const name =
    (JSON.parse(row.action_json) as { accessible_name?: string | null }).accessible_name ?? null;
  const key = linkNameKey(name);
  const seen = (
    ctx.raw
      .prepare(
        `SELECT id, to_state, evidence_ref, stabilization,
                json_extract(action_json, '$.accessible_name') AS name FROM edges
         WHERE run_id = ? AND status = 'executed' AND confidence = 'observed'
           AND to_state IS NOT NULL AND json_extract(action_json, '$.target_url') = ?
         ORDER BY id`,
      )
      .all(row.run_id, target) as (SeenEdge & { name: string | null })[]
  ).find((e) => linkNameKey(e.name) === key);
  if (!seen) return false;
  await settleInferred(ctx, row, seen, `same_target: ${seen.id}`);
  return true;
}

/**
 * Record an `inferred` edge from the item's state to the state `seen` reached (with its evidence)
 * and mark the item `done` with `reason`; one transaction, then a `frontier_infer` event.
 */
export async function settleInferred(
  ctx: ServerContext,
  row: FrontierRow,
  seen: SeenEdge,
  reason: string,
): Promise<void> {
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
      .set({ status: 'done', reason, updated_at: ts })
      .where('id', '=', row.id)
      .execute();
  });
  ctx.tracer.event('frontier_infer', {
    frontier_id: row.id,
    edge_id: edgeId,
    same_as_edge_id: seen.id,
    to_state: seen.to_state,
  });
}
