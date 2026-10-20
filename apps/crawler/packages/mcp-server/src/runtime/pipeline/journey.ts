// The run's journeys (spec 039 design § 5.7): each continuous path of a run. A typed navigation, a
// `go_to_state` replay (a root `checkpoint` journey: the replay walks the recorded path again, so
// its steps are its own, F-10@039), a login or a fresh session starts a new one. Child journeys
// (a parent and a branch seq) are for a browser back, which the crawler does not use yet. The
// run's observations are numbered (`observations.seq`) and each journey's transitions (`transitions.seq`).

import type { JourneyEndReason } from '@pathfinder/core';
import type { ServerContext } from '../../context.js';
import {
  closeJourney,
  hasJourney,
  insertJourney,
  maxObservationSeq,
  writeAttributes,
  type AttributeInput,
  type JourneyStart,
} from '../../services/journeys.js';
import type { RunState } from '../run-state.js';

/** End the run's open journey, if any, with `reason`. */
export async function endJourney(
  ctx: ServerContext,
  rs: RunState,
  reason: JourneyEndReason,
): Promise<void> {
  if (!rs.journey) return;
  await closeJourney(ctx, rs.journey.id, reason);
  rs.journey = null;
  rs.lastObservationId = null;
}

/**
 * Start a journey (ending the open one with `endReason`). A root journey records the persona's
 * attributes at seq 0, the snapshot every later write is read against (design § 5.8).
 */
export async function beginJourney(
  ctx: ServerContext,
  rs: RunState,
  start: JourneyStart,
  endReason: JourneyEndReason = 'reset',
): Promise<string> {
  await endJourney(ctx, rs, endReason);
  const id = await insertJourney(ctx, rs.runId, start);
  rs.journey = { id, seq: start.parent?.branchSeq ?? 0, reached: new Map() };
  if (!start.parent) await writePersonaAttributes(ctx, rs, id);
  return id;
}

/** The journey to record on: the open one, else one started now (`resume` when the run had one). */
export async function ensureJourney(ctx: ServerContext, rs: RunState): Promise<string> {
  if (rs.journey) return rs.journey.id;
  const resumed = await hasJourney(ctx, rs.runId);
  return beginJourney(ctx, rs, { kind: resumed ? 'resume' : 'entry_url' });
}

/** The next observation number of the run (read from the store once, so a resumed run continues). */
export async function nextObservationSeq(ctx: ServerContext, rs: RunState): Promise<number> {
  rs.observationSeq ??= await maxObservationSeq(ctx, rs.runId);
  rs.observationSeq += 1;
  return rs.observationSeq;
}

function writePersonaAttributes(
  ctx: ServerContext,
  rs: RunState,
  journeyId: string,
): Promise<void> {
  const persona = rs.effective.persona;
  const writes: AttributeInput[] = Object.entries(persona.attributes).map(([k, v]) => ({
    seq: 0,
    name: k,
    source: 'persona',
    raw: Array.isArray(v) ? v.join(', ') : String(v),
    asEnum: Array.isArray(v) || typeof v === 'string',
  }));
  writes.push({ seq: 0, name: 'id', source: 'persona', raw: persona.id, asEnum: true });
  return writeAttributes(ctx, journeyId, writes);
}
