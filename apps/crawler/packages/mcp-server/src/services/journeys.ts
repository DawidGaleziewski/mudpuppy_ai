// Journeys and attribute writes in the store (spec 039 design § 5.7–5.8). The run's journey
// bookkeeping (which one is open, its step count) is the runtime's: `runtime/pipeline/journey.ts`.

import {
  AttributeWriteRecord,
  newId,
  nowIso,
  type JourneyEndReason,
  type JourneyStartKind,
} from '@pathfinder/core';
import { attributeName, typeValue } from '@pathfinder/model';
import type { ServerContext } from '../context.js';

export interface JourneyStart {
  kind: JourneyStartKind;
  /** A child journey: the journey it branches from and the transition seq it branches after. */
  parent?: { id: string; branchSeq: number };
  checkpointId?: string;
}

/** Insert a journey row; returns its id. */
export async function insertJourney(
  ctx: ServerContext,
  runId: string,
  start: JourneyStart,
  at = nowIso(),
): Promise<string> {
  const id = newId();
  await ctx.db
    .insertInto('journeys')
    .values({
      id,
      run_id: runId,
      parent_journey_id: start.parent?.id ?? null,
      branch_seq: start.parent?.branchSeq ?? null,
      start_kind: start.kind,
      checkpoint_id: start.checkpointId ?? null,
      end_reason: null,
      started_at: at,
      ended_at: null,
    })
    .execute();
  return id;
}

/** End one journey, once: an ended journey keeps its first reason. */
export async function closeJourney(
  ctx: ServerContext,
  journeyId: string,
  reason: JourneyEndReason,
): Promise<void> {
  await ctx.db
    .updateTable('journeys')
    .set({ end_reason: reason, ended_at: nowIso() })
    .where('id', '=', journeyId)
    .where('ended_at', 'is', null)
    .execute();
}

/** Whether the run has recorded a journey already (a resumed run continues with `resume`). */
export async function hasJourney(ctx: ServerContext, runId: string): Promise<boolean> {
  const row = await ctx.db
    .selectFrom('journeys')
    .select('id')
    .where('run_id', '=', runId)
    .limit(1)
    .executeTakeFirst();
  return row !== undefined;
}

/** The run's highest observation number so far (0 for none). */
export async function maxObservationSeq(ctx: ServerContext, runId: string): Promise<number> {
  const row = await ctx.db
    .selectFrom('observations')
    .select((eb) => eb.fn.max('seq').as('max'))
    .where('run_id', '=', runId)
    .executeTakeFirst();
  return Number(row?.max ?? 0);
}

/** End every journey of the run still open (finish_run). */
export async function endRunJourneys(ctx: ServerContext, runId: string): Promise<void> {
  await ctx.db
    .updateTable('journeys')
    .set({ end_reason: 'run_end', ended_at: nowIso() })
    .where('run_id', '=', runId)
    .where('ended_at', 'is', null)
    .execute();
}

export interface AttributeInput {
  seq: number;
  name: string;
  source: 'persona' | 'input' | 'shown';
  raw: string;
  elementKey?: string | null;
  /** `select` choices and persona words are enums; everything else is typed from its text. */
  asEnum?: boolean;
}

/**
 * Record attribute writes on `journeyId`, one per (seq, name): the first write of a name at a seq
 * wins (a page showing one label twice). Raw values are kept: personas are synthetic (design § 5.8).
 */
export async function writeAttributes(
  ctx: ServerContext,
  journeyId: string,
  writes: readonly AttributeInput[],
  at = nowIso(),
): Promise<void> {
  const seen = new Set<string>();
  const rows = [];
  for (const w of writes) {
    const part = attributeName(w.name);
    if (!part) continue;
    const name = `${w.source}.${part}`;
    if (seen.has(`${w.seq}\u0000${name}`)) continue;
    seen.add(`${w.seq}\u0000${name}`);
    const typed = w.asEnum
      ? { valueType: 'enum' as const, valueNum: null, valueText: w.raw }
      : typeValue(w.raw);
    rows.push(
      AttributeWriteRecord.parse({
        id: newId(),
        journey_id: journeyId,
        seq: w.seq,
        name,
        source: w.source,
        value_type: typed.valueType,
        value_num: typed.valueNum,
        value_text: typed.valueText,
        element_key: w.elementKey ?? null,
        created_at: at,
      }),
    );
  }
  if (rows.length === 0) return;
  await ctx.db
    .insertInto('attribute_writes')
    .values(rows)
    .onConflict((oc) => oc.columns(['journey_id', 'seq', 'name']).doNothing())
    .execute();
}
