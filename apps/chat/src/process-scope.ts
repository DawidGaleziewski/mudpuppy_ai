// A process's scope (designer T-05, D-69; spec 078): adding screens to a saved process is a scope
// change, never a hand edit of the as-is. A is rebuilt from what scans observed: a screen that a
// recorded move links to A's screens joins A's steps where the move puts it; one that no observed
// path reaches stays in the scope as "Not on the observed path yet" (process_scope_screens), in no
// step. To-be models never change here.

import { newId, nowIso } from '@mudpuppy/core';
import type { MudPuppyDb } from '@mudpuppy/store';
import { z } from 'zod';
import { HttpError } from './http-error.js';
import { parseBody } from './http-io.js';
import { editedSteps } from './process-steps.js';
import { loadModel, loadProcess, loadRevision, statesOf, usedStepIds, writeModel, type ProcessOutcome } from './process-store.js';

const ScopeBody = z.object({
  state_ids: z.array(z.string().min(1)).min(1).max(200),
  author: z.string().trim().min(1).max(200).default('BA'),
});

/** A recorded move between two screens (`transitions`, executed). */
export interface Link {
  from: string;
  to: string;
}

/**
 * Where each added screen goes (pure): after the last screen of `order` a move reaches it from,
 * else before the first screen it moves to; a screen placed lets the others link through it.
 * What no observed move connects is `off` (in the scope, in no step).
 */
export function placeStates(order: readonly string[], add: readonly string[], links: readonly Link[]): { order: string[]; off: string[] } {
  const now = [...order];
  let pending = add.filter((s, i) => !now.includes(s) && add.indexOf(s) === i);
  for (let moved = true; moved && pending.length > 0; ) {
    moved = false;
    for (const s of [...pending]) {
      const after = now.map((o, i) => (links.some((l) => l.from === o && l.to === s) ? i : -1)).filter((i) => i >= 0);
      const before = now.findIndex((o) => links.some((l) => l.from === s && l.to === o));
      const at = after.length > 0 ? Math.max(...after) + 1 : before;
      if (at < 0) continue;
      now.splice(at, 0, s);
      pending = pending.filter((p) => p !== s);
      moved = true;
    }
  }
  return { order: now, off: pending };
}

/** The recorded moves between any two of `states` (both ways). */
export async function linksBetween(db: MudPuppyDb, states: readonly string[]): Promise<Link[]> {
  if (states.length < 2) return [];
  const rows = await db
    .selectFrom('transitions')
    .select(['from_state', 'to_state'])
    .where('status', '=', 'executed')
    .where('from_state', 'in', [...states])
    .where('to_state', 'in', [...states])
    .execute();
  return rows.flatMap((r) => (r.to_state === null || r.to_state === r.from_state ? [] : [{ from: r.from_state, to: r.to_state }]));
}

/** The screens in a process's scope that no observed path reaches yet (open rows). */
export async function offPath(db: MudPuppyDb, processId: string): Promise<string[]> {
  const rows = await db.selectFrom('process_scope_screens').select('state_id').where('process_id', '=', processId).where('removed_at', 'is', null).execute();
  return rows.map((r) => r.state_id);
}

/** Put screens in the scope as off the observed path (author, at). */
export async function keepOffPath(db: MudPuppyDb, processId: string, states: readonly string[], author: string, at: string): Promise<void> {
  if (states.length === 0) return;
  await db
    .insertInto('process_scope_screens')
    .values(states.map((state_id) => ({ id: newId(), process_id: processId, state_id, author, added_at: at, removed_at: null, removed_by: null })))
    .execute();
}

async function closeOffPath(db: MudPuppyDb, processId: string, states: readonly string[], author: string): Promise<void> {
  if (states.length === 0) return;
  await db
    .updateTable('process_scope_screens')
    .set({ removed_at: nowIso(), removed_by: author })
    .where('process_id', '=', processId)
    .where('state_id', 'in', [...states])
    .where('removed_at', 'is', null)
    .execute();
}

export interface ScopeOutcome extends ProcessOutcome {
  /** Each screen asked for: joined A's steps, or kept off the observed path. */
  added: { state_id: string; title: string; on_path: boolean }[];
}

/** Add screens to a process's scope: A rebuilt from the observed moves (a `scope` revision when any joined). */
async function addToScope(db: MudPuppyDb, portal: string, id: string, raw: unknown): Promise<ScopeOutcome> {
  const body = parseBody(ScopeBody, raw);
  return db.transaction().execute(async (trx) => {
    const process = await loadProcess(trx, portal, id);
    if (process.archived_at !== null) throw new HttpError(409, `${process.key} is archived; restore it first.`);
    const head = await loadModel(trx, process.id, 'A');
    const current = await loadRevision(trx, head.id, head.rev);
    const inA = current.steps.flatMap((s) => (s.state_id === null ? [] : [s.state_id]));
    const off = await offPath(trx, process.id);
    const asked = await statesOf(trx, portal, body.state_ids);
    const already = asked.filter((s) => inA.includes(s.id) || off.includes(s.id));
    if (already.length === asked.length)
      throw new HttpError(409, `Already in ${process.key}: ${already.map((s) => s.title || s.id).join(', ')}.`, { code: 'UNCHANGED' });
    const fresh = asked.filter((s) => !already.includes(s));
    const placed = placeStates(inA, fresh.map((s) => s.id), await linksBetween(trx, [...inA, ...fresh.map((s) => s.id)]));
    const now = nowIso();
    await keepOffPath(trx, process.id, placed.off, body.author, now);
    const added = fresh.map((s) => ({ state_id: s.id, title: s.title, on_path: !placed.off.includes(s.id) }));
    if (placed.order.length === inA.length) return { process, added };
    const states = await statesOf(trx, portal, placed.order);
    const steps = editedSteps(current.steps, states, await usedStepIds(trx, head.id));
    const joined = added.filter((a) => a.on_path).map((a) => a.title || a.state_id);
    const written = await writeModel(trx, head, head.rev, { change: 'scope', author: body.author, steps, note: `Scope change: ${joined.join(', ')} joined from what scans saw` });
    return { process, ...written, added };
  });
}

/** Undo: the screens leave the scope, and A's steps for them go (a `scope` revision when any were in A). */
async function removeFromScope(db: MudPuppyDb, portal: string, id: string, raw: unknown): Promise<ProcessOutcome> {
  const body = parseBody(ScopeBody, raw);
  return db.transaction().execute(async (trx) => {
    const process = await loadProcess(trx, portal, id);
    const head = await loadModel(trx, process.id, 'A');
    const current = await loadRevision(trx, head.id, head.rev);
    await closeOffPath(trx, process.id, body.state_ids, body.author);
    const steps = current.steps.filter((s) => s.state_id === null || !body.state_ids.includes(s.state_id));
    if (steps.length === current.steps.length) return { process };
    if (steps.length === 0) throw new HttpError(409, `${process.key} would have no step left.`);
    const written = await writeModel(trx, head, head.rev, { change: 'scope', author: body.author, steps, note: 'Scope change undone' });
    return { process, ...written };
  });
}

export function scopeService(db: MudPuppyDb) {
  return {
    addToScope: (portal: string, id: string, raw: unknown) => addToScope(db, portal, id, raw),
    removeFromScope: (portal: string, id: string, raw: unknown) => removeFromScope(db, portal, id, raw),
  };
}
