import { describe, expect, it } from 'vitest';
import { bumpRun } from '../src/runtime/pipeline/stop.js';
import { getRun } from '../src/services/index.js';
import { makeCtx, seedRun } from './helpers.js';

describe('bumpRun (spec 019 F-11)', () => {
  it('never records a negative step when the clock seems to run backwards', async () => {
    const ctx = await makeCtx();
    const runId = await seedRun(ctx);
    const run = await getRun(ctx, runId);
    // a start "in the future": what a wall clock stepping back looked like
    await bumpRun(ctx, run, performance.now() + 5_000, 2);
    const after = await getRun(ctx, runId);
    expect(after.steps_used).toBe(run.steps_used + 1);
    expect(after.elapsed_ms).toBe(run.elapsed_ms);
    expect(after.max_depth_reached).toBe(2);
  });
});
