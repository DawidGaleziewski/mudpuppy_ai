import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Body, Call } from './harness.js';
import { available, insurer, useInsurerMocks } from './insurer-harness.js';

useInsurerMocks();

/** Per tool: calls and the characters of the results the agent reads (a token proxy, spec 013). */
type Usage = Record<string, { calls: number; chars: number }>;

/**
 * `reread` approximates the agent's cache reads: every call re-reads all results before it, so it
 * grows with (calls × context), the quadratic cost of spec 010 F-16.
 */
function metered(call: Call): {
  call: Call;
  usage: Usage;
  context: { chars: number; reread: number };
} {
  const usage: Usage = {};
  const context = { chars: 0, reread: 0 };
  return {
    usage,
    context,
    call: async (name, args) => {
      context.reread += context.chars;
      const r = await call(name, args);
      const size = JSON.stringify(r.body).length;
      const u = (usage[name] ??= { calls: 0, chars: 0 });
      u.calls += 1;
      u.chars += size;
      context.chars += size;
      return r;
    },
  };
}

/**
 * The agent's loop as the crawler brief describes it: act on the item a result names as `next`,
 * else ask `get_next_frontier_item`, until the frontier is empty.
 */
async function drain(call: Call, runId: string, first: Body, maxSteps = 300): Promise<void> {
  let last = first;
  for (let i = 0; i < maxSteps; i++) {
    let item = last.next?.item as Body | null | undefined;
    if (item === undefined) {
      const next = await call('get_next_frontier_item', { run_id: runId });
      if (next.isError) return;
      item = next.body.item as Body | null;
    }
    if (!item) return;
    const r = await call('act', {
      run_id: runId,
      action_id: item.action_id,
      rationale: 'exploring the next frontier item',
    });
    last = r.body;
  }
}

const total = (u: Usage) =>
  Object.values(u).reduce((s, x) => ({ calls: s.calls + x.calls, chars: s.chars + x.chars }), {
    calls: 0,
    chars: 0,
  });

describe.skipIf(!available)('token budget of a scripted map drain (spec 013 SC-001)', () => {
  it('drains the insurer mock within the call and result-size budget, with the same coverage', async () => {
    const { mock, ctx, call: raw, cleanup } = await insurer();
    const { call, usage, context } = metered(raw);
    try {
      const start = await call('start_run', { portal_id: 'insurer', persona_id: 'guest' });
      const runId = start.body.run_id as string;
      const home = await call('navigate', {
        run_id: runId,
        url: mock.origin + '/',
        rationale: 'exploring the base URL',
      });
      await drain(call, runId, home.body);
      const fin = await call('finish_run', { run_id: runId, rationale: 'frontier exhausted' });
      const states = await ctx.db.selectFrom('states').select('id').execute();
      const sum = total(usage);
      // `TOKEN_BUDGET_OUT=<file>` writes the measured numbers (spec 013 plan.md, findings.md).
      const out = process.env.TOKEN_BUDGET_OUT;
      const m = { states: states.length, ...sum, reread: context.reread, usage };
      if (out) writeFileSync(out, JSON.stringify(m) + '\n');
      expect(fin.body.error).toBeUndefined();
      // Baseline before spec 013 (2340823): 6 states, 78 calls, 89,422 chars, 3,555,695 re-read.
      // Measured after: 6 states, 12 calls, 16,308 chars, 109,213 re-read. The budget leaves
      // headroom for small result-shape changes but fails on a return of the per-page lists or
      // of one call per shared link.
      expect(states.length).toBe(6);
      expect(sum.calls).toBeLessThanOrEqual(20);
      expect(context.reread).toBeLessThanOrEqual(400_000);
      const inferred = await ctx.db
        .selectFrom('transitions')
        .select('id')
        .where('run_id', '=', runId)
        .where('confidence', '=', 'inferred')
        .execute();
      expect(inferred.length).toBeGreaterThan(0);
      // finish_run reports clicked and inferred links apart.
      expect(fin.body.coverage).toMatchObject({ actions_inferred: inferred.length });
    } finally {
      await cleanup();
    }
  }, 180_000);
});
