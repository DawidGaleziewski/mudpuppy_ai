import { describe, expect, it } from 'vitest';
import { newId, nowIso } from '@pathfinder/core';
import type { ServerContext } from '../src/context.js';
import { ToolError } from '../src/errors.js';
import { retireOnCrash } from '../src/runtime/pipeline/act.js';
import { FP, makeCtx, REF, seedRun } from './helpers.js';

// spec 030 F-05 / spec 031 T003: an `act` that crashes retires its pending item, so a crash can
// never wedge `finish_run` (field GC-15, GC-18); a refusal or the agent's own mistake does not.

function seedPendingItem(ctx: ServerContext, runId: string): { actionId: string; itemId: string } {
  const stateId = newId();
  const actionId = newId();
  const itemId = newId();
  const ts = nowIso();
  const json = JSON.stringify({ role: 'link', accessible_name: 'Offer' });
  ctx.raw
    .prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title,
         evidence_ref, confidence, stabilization, first_seen_run, created_at)
       VALUES (?, 'shop', ?, ?, '/', 'Home', ?, 'observed', 'settled', ?, ?)`,
    )
    .run(stateId, FP('a'), stateId, REF, runId, ts);
  ctx.raw
    .prepare(
      `INSERT INTO actions (id, run_id, state_id, role, accessible_name, action_json, safety_class,
         allowed, skip_reason, created_at) VALUES (?, ?, ?, 'link', 'Offer', ?, 'read', 1, NULL, ?)`,
    )
    .run(actionId, runId, stateId, json, ts);
  ctx.raw
    .prepare(
      `INSERT INTO frontier (id, run_id, state_id, action_id, action_json, safety_class, status,
         priority, depth, reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'read', 'pending', 0, 0, NULL, ?, ?)`,
    )
    .run(itemId, runId, stateId, actionId, json, ts, ts);
  return { actionId, itemId };
}

const item = (ctx: ServerContext, id: string) =>
  ctx.raw.prepare('SELECT status, reason FROM frontier WHERE id = ?').get(id) as {
    status: string;
    reason: string | null;
  };

describe('retireOnCrash (spec 030 F-05)', () => {
  it.each([
    ['a plain crash', new Error('Target page, context or browser has been closed\nstack')],
    ['NAVIGATION_FAILED', new ToolError('NAVIGATION_FAILED', 'net::ERR_ABORTED')],
    ['SAFETY_CLASS_MISMATCH', new ToolError('SAFETY_CLASS_MISMATCH', 'changed class')],
  ])('retires the pending item on %s, with the first line of the error', async (_, err) => {
    const ctx = await makeCtx();
    const runId = await seedRun(ctx);
    const { actionId, itemId } = seedPendingItem(ctx, runId);
    await retireOnCrash(ctx, runId, actionId, err);
    const row = item(ctx, itemId);
    expect(row.status).toBe('unreachable');
    expect(row.reason).toBe(`act_failed: ${err.message.split('\n')[0]}`);
  });

  it.each(['ACTION_REFUSED', 'ACTION_NOT_FOUND', 'INTENT_REQUIRED'])(
    'leaves the item pending on %s (a refusal or the agent’s mistake)',
    async (code) => {
      const ctx = await makeCtx();
      const runId = await seedRun(ctx);
      const { actionId, itemId } = seedPendingItem(ctx, runId);
      await retireOnCrash(ctx, runId, actionId, new ToolError(code as never, 'no'));
      expect(item(ctx, itemId).status).toBe('pending');
    },
  );

  it('does nothing when the action has no pending item', async () => {
    const ctx = await makeCtx();
    const runId = await seedRun(ctx);
    await expect(retireOnCrash(ctx, runId, newId(), new Error('boom'))).resolves.toBeUndefined();
  });
});
