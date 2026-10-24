// Merging two saved processes (designer T-06, D-70; spec 078): for the same persona only, one
// absorbs the other. The kept one keeps its key, links and history; its A is rebuilt over the
// union of both scopes from what scans observed (a `merge` revision); the absorbed one's to-be
// models move over with the next letters (still branched from the other's as-is, so they must be
// re-based before Compare uses them); the absorbed one is archived as merged. process_merges keeps
// enough to put everything back: Undo for 10 s, or Split back later from History.

import { newId, nowIso } from '@mudpuppy/core';
import { type BaProcess, ProcessMerge, ProcessModel } from '@mudpuppy/chat-model';
import { applyReview } from '@mudpuppy/docs';
import type { MudPuppyDb, OpenedDb } from '@mudpuppy/store';
import { z } from 'zod';
import { HttpError } from './http-error.js';
import { parseBody } from './http-io.js';
import { linksBetween, keepOffPath, offPath, placeStates, scopeService } from './process-scope.js';
import { editedSteps, nextLabel } from './process-steps.js';
import { loadModel, loadProcess, loadRevision, parseRow, statesOf, usedStepIds, writeModel, writeProcess } from './process-store.js';

type RawDb = OpenedDb['raw'];

const Author = z.string().trim().min(1).max(200).default('BA');
const MergeBody = z.object({
  keep: z.string().min(1),
  absorb: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  /** The start and end screens when the two differ (BR-011: one start, one end). */
  start: z.string().min(1).optional(),
  end: z.string().min(1).optional(),
  reason: z.string().trim().max(500).optional(),
  dry_run: z.boolean().default(false),
  author: Author,
});
const UndoBody = z.object({ author: Author });

const DIFFERENT_PERSONAS = "Processes for different personas can't be merged: compare them instead.";

/** What the merge will do, computed by the server for the chosen pair (the dialog shows it as is). */
export interface MergePlan {
  keep: { id: string; key: string; name: string; persona: string; steps: number; models: string[] };
  absorb: { id: string; key: string; name: string; persona: string; steps: number; models: string[] };
  name: string;
  /** The merged scope: every screen of both, in the walking order the observed moves give. */
  scope: { states: string[]; from_absorbed: string[]; off_path: string[] };
  starts: string[];
  ends: string[];
  as_is_rev: number;
  /** The absorbed process's to-be models and the letters they get. */
  moves: { model_id: string; from_label: string; to_label: string }[];
  /** The absorbed process's PROC record, which gets a "merged into" note for the BA (spec 079). */
  record: string | null;
}

async function modelsOf(db: MudPuppyDb, processId: string): Promise<ProcessModel[]> {
  const rows = await db.selectFrom('process_models').selectAll().where('process_id', '=', processId).orderBy('label').execute();
  return rows.map((r) => ProcessModel.parse(r));
}

const stateIds = (steps: readonly { state_id: string | null }[]) => steps.flatMap((s) => (s.state_id === null ? [] : [s.state_id]));

/** The two, checked: same portal and persona, both saved and in the list, not the same one. */
async function pair(db: MudPuppyDb, portal: string, keepId: string, absorbId: string) {
  if (keepId === absorbId) throw new HttpError(409, 'A process cannot absorb itself.');
  const keep = await loadProcess(db, portal, keepId);
  const absorb = await loadProcess(db, portal, absorbId);
  if (keep.persona !== absorb.persona) throw new HttpError(409, DIFFERENT_PERSONAS, { code: 'DIFFERENT_PERSONAS' });
  for (const p of [keep, absorb]) if (p.archived_at !== null) throw new HttpError(409, `${p.key} is archived; restore it first.`);
  return { keep, absorb };
}

/** The steps' order with the chosen start first and end last (the others stay included screens). */
function withEnds(order: string[], start: string | undefined, end: string | undefined): string[] {
  const out = order.filter((s) => s !== start && s !== end);
  return [...(start && order.includes(start) ? [start] : []), ...out, ...(end && order.includes(end) && end !== start ? [end] : [])];
}

async function plan(db: MudPuppyDb, portal: string, body: z.infer<typeof MergeBody>): Promise<MergePlan & { order: string[]; keepA: ProcessModel }> {
  const { keep, absorb } = await pair(db, portal, body.keep, body.absorb);
  const [keepA, absorbA] = [await loadModel(db, keep.id, 'A'), await loadModel(db, absorb.id, 'A')];
  const [kept, other] = [await loadRevision(db, keepA.id, keepA.rev), await loadRevision(db, absorbA.id, absorbA.rev)];
  const inKeep = stateIds(kept.steps);
  const extra = [...stateIds(other.steps), ...(await offPath(db, absorb.id))].filter((s) => !inKeep.includes(s));
  const placed = placeStates(inKeep, extra, await linksBetween(db, [...inKeep, ...extra]));
  const [keepModels, absorbModels] = [await modelsOf(db, keep.id), await modelsOf(db, absorb.id)];
  const labels = keepModels.map((m) => m.label);
  const moves = absorbModels
    .filter((m) => m.kind === 'to_be')
    .map((m) => {
      const to = nextLabel(labels);
      labels.push(to);
      return { model_id: m.id, from_label: m.label, to_label: to };
    });
  const facts = (p: BaProcess, steps: number, models: ProcessModel[]) => ({ id: p.id, key: p.key, name: p.name, persona: p.persona, steps, models: models.map((m) => `${m.label} r${String(m.rev)}`) });
  return {
    keep: facts(keep, kept.steps.length, keepModels),
    absorb: facts(absorb, other.steps.length, absorbModels),
    name: body.name ?? keep.name,
    scope: { states: placed.order, from_absorbed: extra.filter((s) => !placed.off.includes(s)), off_path: placed.off },
    starts: [...new Set([inKeep[0], stateIds(other.steps)[0]].filter((s): s is string => s !== undefined))],
    ends: [...new Set([inKeep.at(-1), stateIds(other.steps).at(-1)].filter((s): s is string => s !== undefined))],
    as_is_rev: keepA.rev + 1,
    moves,
    record: (await db.selectFrom('doc_records').select('key').where('process_id', '=', absorb.id).where('kind', '=', 'process').where('withdrawn', '=', 0).executeTakeFirst())?.key ?? null,
    order: withEnds(placed.order, body.start, body.end),
    keepA,
  };
}

/** A merge (or its dry run): the plan, then every write in one transaction. */
async function merge(db: MudPuppyDb, portal: string, raw: unknown) {
  const body = parseBody(MergeBody, raw);
  return db.transaction().execute(async (trx) => {
    const p = await plan(trx, portal, body);
    const { order, keepA, ...facts } = p;
    if (body.dry_run) return { plan: facts };
    const [keep, absorb] = [await loadProcess(trx, portal, p.keep.id), await loadProcess(trx, portal, p.absorb.id)];
    const current = await loadRevision(trx, keepA.id, keepA.rev);
    const steps = editedSteps(current.steps, await statesOf(trx, portal, order), await usedStepIds(trx, keepA.id));
    const note = `Merged scope with ${absorb.key} ${absorb.name}`;
    const written = await writeModel(trx, keepA, keepA.rev, { change: 'merge', author: body.author, steps, note });
    const now = nowIso();
    await keepOffPath(trx, keep.id, p.scope.off_path, body.author, now);
    for (const m of p.moves) await trx.updateTable('process_models').set({ process_id: keep.id, label: m.to_label }).where('id', '=', m.model_id).execute();
    const renamed = p.name !== keep.name ? await writeProcess(trx, keep, keep.rev, { change: 'merge', author: body.author, name: p.name }) : keep;
    await writeProcess(trx, absorb, absorb.rev, { change: 'merge', author: body.author, archived: true });
    const row = ProcessMerge.parse({
      id: newId(),
      portal_id: portal,
      kept_process_id: keep.id,
      absorbed_process_id: absorb.id,
      author: body.author,
      reason: body.reason ?? null,
      kept_name_before: keep.name,
      kept_as_is_rev_before: keepA.rev,
      kept_as_is_rev_after: written.revision.rev,
      moved_json: p.moves,
      created_at: now,
      undone_at: null,
      undone_by: null,
    });
    await trx.insertInto('process_merges').values({ ...row, moved_json: JSON.stringify(row.moved_json) }).execute();
    return { process: renamed, model: written.model, revision: written.revision, merge: row };
  });
}

/** Undo or Split back: the absorbed process back with its models as they are now, the kept one's A and name put back. */
async function unmerge(db: MudPuppyDb, portal: string, mergeId: string, raw: unknown) {
  const body = parseBody(UndoBody, raw);
  return db.transaction().execute(async (trx) => {
    const found = await trx.selectFrom('process_merges').selectAll().where('id', '=', mergeId).where('portal_id', '=', portal).executeTakeFirst();
    if (found === undefined) throw new HttpError(404, 'This merge does not exist.');
    const m = parseRow(ProcessMerge, found, ['moved_json']);
    if (m.undone_at !== null) throw new HttpError(409, 'This merge was undone already.', { code: 'UNCHANGED' });
    const [keep, absorb] = [await loadProcess(trx, portal, m.kept_process_id), await loadProcess(trx, portal, m.absorbed_process_id)];
    for (const mv of m.moved_json) await trx.updateTable('process_models').set({ process_id: absorb.id, label: mv.from_label }).where('id', '=', mv.model_id).execute();
    const keepA = await loadModel(trx, keep.id, 'A');
    const before = await loadRevision(trx, keepA.id, m.kept_as_is_rev_before);
    const note = `Split back ${absorb.key} ${absorb.name}`;
    const written = await writeModel(trx, keepA, keepA.rev, { change: 'unmerge', author: body.author, steps: before.steps, note, restored_from: before.rev });
    await trx.updateTable('process_scope_screens').set({ removed_at: nowIso(), removed_by: body.author }).where('process_id', '=', keep.id).where('added_at', '=', m.created_at).where('removed_at', 'is', null).execute();
    const kept = keep.name !== m.kept_name_before ? await writeProcess(trx, keep, keep.rev, { change: 'unmerge', author: body.author, name: m.kept_name_before }) : keep;
    const back = await writeProcess(trx, absorb, absorb.rev, { change: 'unmerge', author: body.author, archived: false });
    await trx.updateTable('process_merges').set({ undone_at: nowIso(), undone_by: body.author }).where('id', '=', m.id).execute();
    return { process: kept, absorbed: back, revision: written.revision };
  });
}

/**
 * The absorbed process's PROC record hears of it (spec 078 F-01, spec 079 FR-004): a review
 * comment on its latest revision, the only way a person writes to a record, so the BA's next
 * session revises or withdraws it (its pending feedback). Split back says the note no longer
 * applies. A process without a PROC record has nothing to tell.
 */
function noteOnRecord(raw: RawDb | undefined, portal: string, processId: string, text: string, reviewer: string): void {
  if (raw === undefined) return;
  const record = raw
    .prepare(`SELECT key, latest_rev FROM doc_records WHERE portal_id = ? AND process_id = ? AND kind = 'process' AND withdrawn = 0`)
    .get(portal, processId) as { key: string; latest_rev: number } | undefined;
  if (record === undefined) return;
  applyReview(raw, { portal_id: portal, key: record.key, rev_no: record.latest_rev, action: 'comment', text, reviewer });
}

function mergeService(db: MudPuppyDb, raw: RawDb | undefined) {
  return {
    mergeProcesses: async (portal: string, body: unknown) => {
      const done = await merge(db, portal, body);
      const { merge: m, process } = 'merge' in done ? done : {};
      if (m !== undefined && process !== undefined) {
        const why = `Merged into ${process.key} ${process.name} by ${m.author}: this process is archived; revise or withdraw this record.`;
        noteOnRecord(raw, portal, m.absorbed_process_id, why, m.author);
      }
      return done;
    },
    unmerge: async (portal: string, mergeId: string, body: unknown) => {
      const done = await unmerge(db, portal, mergeId, body);
      const why = `Split back from ${done.process.key} ${done.process.name}: the merge note above no longer applies.`;
      noteOnRecord(raw, portal, done.absorbed.id, why, parseBody(UndoBody, body).author);
      return done;
    },
  };
}

/** Spec 078's process writes for the process service: Add to process as a scope change (T-05), merging two processes (T-06). */
export const scopeAndMergeService = (db: MudPuppyDb, raw?: RawDb) => ({ ...scopeService(db), ...mergeService(db, raw) });
