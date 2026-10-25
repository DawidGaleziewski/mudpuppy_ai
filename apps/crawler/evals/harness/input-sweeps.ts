/**
 * `--sweep-inputs` (spec 080 FR-003, R-97 (4)): after the map, the walks that typed a bounded
 * number before a page of values are replayed over the number's range on the headless driver (no
 * LLM, no cost), so the BA's rules pass sees each band edge. Off by default: a trial with it is
 * compared with a baseline without it only under a conditions warning.
 */
import { createBrowserRuntime, openLocalClient, sweepPortal } from '@mudpuppy/mcp-server';
import type { EvalConfig } from '../config.js';

export async function runInputSweeps(c: EvalConfig, ws: string): Promise<number> {
  if (!c.sweepInputs) return 0;
  const local = await openLocalClient({
    root: ws,
    environment: c.env,
    runtime: createBrowserRuntime(),
  });
  try {
    const r = await sweepPortal(local.call, local.ctx.raw, c.portal);
    const edges = r.sweeps.reduce((n, s) => n + s.bands.length, 0);
    console.log(
      `input sweeps: ${String(r.sweeps.length)} input(s), ${String(r.replays)} replay(s), ${String(edges)} band edge(s)`,
    );
    return r.replays;
  } finally {
    await local.close();
  }
}
