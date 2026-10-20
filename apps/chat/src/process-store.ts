// Reads and the revision write of BA processes (spec 022 M5), used inside the callers'
// transactions. A write on a stale base answers 409 STALE_REVISION and overwrites nothing.

import { newId, nowIso } from '@pathfinder/core';
import {
  BaProcess,
  type BaProcessChange,
  ProcessVariant,
  ProcessVariantRevision,
} from '@pathfinder/chat-model';
import { type PathfinderDb } from '@pathfinder/store';
import type { z } from 'zod';
import { HttpError } from './http-error.js';
import { nextProcessKey, observedSteps, type StateRow, type Steps } from './process-steps.js';

/** Parse a row whose JSON columns are still text. */
export function parseRow<T>(
  schema: z.ZodType<T>,
  row: Record<string, unknown>,
  jsonKeys: readonly string[],
): T {
  const decoded = Object.entries(row).map(([k, v]) => [
    k,
    jsonKeys.includes(k) && typeof v === 'string' ? (JSON.parse(v) as unknown) : v,
  ]);
  return schema.parse(Object.fromEntries(decoded));
}

export function stale(what: string, had: number, now: number, latest: unknown): HttpError {
  return new HttpError(
    409,
    `${what} changed since you opened it (you had revision ${String(had)}, it is now ${String(now)}). Nothing was overwritten.`,
    { code: 'STALE_REVISION', latest },
  );
}

export async function loadProcess(
  db: PathfinderDb,
  portal: string,
  id: string,
): Promise<BaProcess> {
  const row = await db
    .selectFrom('ba_processes')
    .selectAll()
    .where('portal_id', '=', portal)
    .where('id', '=', id)
    .executeTakeFirst();
  if (row === undefined) throw new HttpError(404, 'This process does not exist.');
  return BaProcess.parse(row);
}

export async function loadVariant(
  db: PathfinderDb,
  processId: string,
  label: string,
): Promise<ProcessVariant> {
  const row = await db
    .selectFrom('process_models')
    .selectAll()
    .where('process_id', '=', processId)
    .where('label', '=', label)
    .executeTakeFirst();
  if (row === undefined) throw new HttpError(404, `This process has no variant ${label}.`);
  return ProcessVariant.parse(row);
}

export async function loadRevision(
  db: PathfinderDb,
  variantId: string,
  rev: number,
): Promise<ProcessVariantRevision> {
  const row = await db
    .selectFrom('process_model_revisions')
    .selectAll()
    .where('variant_id', '=', variantId)
    .where('rev', '=', rev)
    .executeTakeFirst();
  if (row === undefined) throw new HttpError(404, `This variant has no revision ${String(rev)}.`);
  return parseRow(ProcessVariantRevision, row, ['steps']);
}

/** Recorded states of the portal in the given order; 404 naming the unknown ones. */
export async function statesOf(
  db: PathfinderDb,
  portal: string,
  ids: readonly string[],
): Promise<StateRow[]> {
  const rows =
    ids.length === 0
      ? []
      : await db
          .selectFrom('states')
          .select(['id', 'title', 'route_template', 'screen_id'])
          .where('portal_id', '=', portal)
          .where('id', 'in', [...ids])
          .execute();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0)
    throw new HttpError(404, `This portal has no recorded screen ${missing.join(', ')}.`);
  return ids.map((id) => byId.get(id)!);
}

/** Which of the steps' states the portal has recorded. */
export async function knownStates(
  db: PathfinderDb,
  portal: string,
  steps: Steps,
): Promise<Set<string>> {
  const ids = steps.flatMap((s) => (s.state_id === null ? [] : [s.state_id]));
  if (ids.length === 0) return new Set();
  const rows = await db
    .selectFrom('states')
    .select('id')
    .where('portal_id', '=', portal)
    .where('id', 'in', ids)
    .execute();
  return new Set(rows.map((r) => r.id));
}

/** Every step id any revision of a variant used (a new step's id never repeats one). */
export async function usedStepIds(db: PathfinderDb, variantId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('process_model_revisions')
    .select('steps')
    .where('variant_id', '=', variantId)
    .execute();
  return rows.flatMap((r) => (JSON.parse(r.steps) as { id: string }[]).map((s) => s.id));
}

/** Step ids of the revision a variant was branched from (what `from` may point at). */
export async function parentStepIds(db: PathfinderDb, v: ProcessVariant): Promise<Set<string>> {
  if (v.branched_from_variant_id === null || v.branched_from_rev === null) return new Set();
  const parent = await loadRevision(db, v.branched_from_variant_id, v.branched_from_rev);
  return new Set(parent.steps.map((s) => s.id));
}

export async function insertVariantRevision(
  db: PathfinderDb,
  r: Omit<ProcessVariantRevision, 'created_at'>,
): Promise<ProcessVariantRevision> {
  const row = ProcessVariantRevision.parse({ ...r, created_at: nowIso() });
  await db
    .insertInto('process_model_revisions')
    .values({ ...row, steps: JSON.stringify(row.steps) })
    .execute();
  return row;
}

export interface VariantWrite {
  change: ProcessVariantRevision['change'];
  author: string;
  steps: Steps;
  note?: string | null;
  restored_from?: number | null;
}

/** Move a variant head on to a new revision; refuses a stale base. */
export async function writeVariant(
  db: PathfinderDb,
  head: ProcessVariant,
  baseRev: number,
  w: VariantWrite,
): Promise<{ variant: ProcessVariant; revision: ProcessVariantRevision }> {
  const what = `Variant ${head.label}`;
  if (baseRev !== head.rev) throw stale(what, baseRev, head.rev, head);
  const done = await db
    .updateTable('process_models')
    .set({ rev: head.rev + 1 })
    .where('id', '=', head.id)
    .where('rev', '=', head.rev) // another writer got there first: no lost update
    .executeTakeFirst();
  if (Number(done.numUpdatedRows) !== 1) throw stale(what, baseRev, head.rev + 1, head);
  const revision = await insertVariantRevision(db, {
    variant_id: head.id,
    rev: head.rev + 1,
    base_rev: head.rev,
    change: w.change,
    author: w.author,
    steps: w.steps,
    note: w.note ?? null,
    run_id: null,
    restored_from: w.restored_from ?? null,
  });
  return { variant: { ...head, rev: head.rev + 1 }, revision };
}

export interface ProcessWrite {
  change: BaProcessChange;
  author: string;
  name?: string;
  stage?: BaProcess['stage'];
  /** true archives, false restores, absent keeps (spec 027 FR-003). */
  archived?: boolean;
  /** The A revision a stage change signs off (spec 027 FR-005). */
  as_is_rev?: number | null;
}

function archivedAt(head: BaProcess, archived: boolean | undefined, now: string): string | null {
  if (archived === undefined) return head.archived_at;
  return archived ? now : null;
}

/** Move a process head on to a new revision (rename, stage, archive); refuses a stale base. */
export async function writeProcess(
  db: PathfinderDb,
  head: BaProcess,
  baseRev: number,
  w: ProcessWrite,
): Promise<BaProcess> {
  if (baseRev !== head.rev) throw stale(head.key, baseRev, head.rev, head);
  const now = nowIso();
  const next = BaProcess.parse({
    ...head,
    name: w.name ?? head.name,
    stage: w.stage ?? head.stage,
    rev: head.rev + 1,
    updated_at: now,
    archived_at: archivedAt(head, w.archived, now),
  });
  const done = await db
    .updateTable('ba_processes')
    .set({
      name: next.name,
      stage: next.stage,
      rev: next.rev,
      updated_at: next.updated_at,
      archived_at: next.archived_at,
    })
    .where('id', '=', head.id)
    .where('rev', '=', head.rev) // another writer got there first: no lost update
    .executeTakeFirst();
  if (Number(done.numUpdatedRows) !== 1) throw stale(head.key, baseRev, next.rev, head);
  await db
    .insertInto('ba_process_revisions')
    .values({
      process_id: head.id,
      rev: next.rev,
      base_rev: head.rev,
      change: w.change,
      author: w.author,
      name: next.name,
      stage: next.stage,
      as_is_rev: w.as_is_rev ?? null,
      created_at: now,
    })
    .execute();
  return next;
}

export interface ProcessOutcome {
  process: BaProcess;
  variant?: ProcessVariant;
  revision?: ProcessVariantRevision;
}

export interface NewProcess {
  name: string;
  persona: string;
  states: StateRow[];
  author: string;
  source: 'suggestion' | 'new';
  suggestion_id?: string;
  /** The PROC record it is opened from (spec 027 US6). */
  record_key?: string;
}

/** A new process with its revision r1 and its as-is A r1 built from recorded states. */
export async function insertProcess(
  db: PathfinderDb,
  portal: string,
  input: NewProcess,
): Promise<ProcessOutcome> {
  const keys = await db
    .selectFrom('ba_processes')
    .select('key')
    .where('portal_id', '=', portal)
    .execute();
  const now = nowIso();
  const process = BaProcess.parse({
    id: newId(),
    portal_id: portal,
    key: nextProcessKey(keys.map((k) => k.key)),
    name: input.name,
    persona: input.persona,
    stage: 'scoped',
    rev: 1,
    source: input.source,
    scope_id: null,
    suggestion_id: input.suggestion_id ?? null,
    created_at: now,
    updated_at: now,
    archived_at: null,
    record_key: input.record_key ?? null,
  });
  await db.insertInto('ba_processes').values(process).execute();
  await db
    .insertInto('ba_process_revisions')
    .values({
      process_id: process.id,
      rev: 1,
      base_rev: null,
      change: 'create',
      author: input.author,
      name: process.name,
      stage: process.stage,
      created_at: now,
    })
    .execute();
  return { process, ...(await insertAsIs(db, process.id, input, now)) };
}

/**
 * The as-is model A r1 of a process, built from recorded states: with a new process, or for one
 * the BA's process record opened without it (spec 039 T070).
 */
export async function insertAsIs(
  db: PathfinderDb,
  processId: string,
  input: Pick<NewProcess, 'states' | 'author' | 'source'>,
  now = nowIso(),
): Promise<Omit<ProcessOutcome, 'process'>> {
  const variant = ProcessVariant.parse({
    id: newId(),
    process_id: processId,
    label: 'A',
    kind: 'as_is',
    rev: 1,
    branched_from_variant_id: null,
    branched_from_rev: null,
    created_at: now,
  });
  await db.insertInto('process_models').values(variant).execute();
  const revision = await insertVariantRevision(db, {
    variant_id: variant.id,
    rev: 1,
    base_rev: null,
    change: 'create',
    author: input.author,
    steps: observedSteps(input.states),
    note: input.source === 'suggestion' ? 'Accepted the assistant’s suggestion' : 'Created',
    run_id: null,
    restored_from: null,
  });
  return { variant, revision };
}
