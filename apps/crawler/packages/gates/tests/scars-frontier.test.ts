import { afterAll, beforeAll, expect } from 'vitest';
import {
  gate,
  gateServer,
  resetScars,
  rows,
  SCAR_BASE,
  scarNav,
  startRun,
  type Body,
  type GateServer,
} from '../src/index.js';

/**
 * The frontier never wedges (spec 030 R-58, SC-07): an agent loop that takes every item it is
 * handed ends with `finish_run` succeeding, and no item is handed out again once it failed.
 */
const PORTAL = 'scar-maker';

let gs: GateServer;

beforeAll(async () => {
  await resetScars();
  gs = await gateServer({ portals: [PORTAL] });
});
afterAll(async () => {
  await gs?.close();
});

/** Take what the frontier hands out until it is empty (or a cap); the frontier ids handed out. */
async function drain(run: string, cap: number): Promise<string[]> {
  const handed: string[] = [];
  for (let i = 0; i < cap; i++) {
    const next = await gs.call('get_next_frontier_item', { run_id: run });
    const item = (next.body as { item: Body | null }).item;
    if (!item) break;
    handed.push(item.frontier_id as string);
    // A refusal or failure is the frontier's business: the loop just goes on, like the agent.
    const url = /^navigate to (.+)$/.exec(item.description as string)?.[1];
    if (item.action_id)
      await gs.call('act', { run_id: run, action_id: item.action_id, rationale: 'gate step' });
    else if (url) await gs.call('navigate', { run_id: run, url, rationale: 'gate step' });
  }
  return handed;
}

// Already held on master before spec 030 (pop-ups queued as navigate items, spec 020; a vanished
// or covered element settles its item as unreachable, spec 015/026); the field fork wedged here.
gate('SC-07', 'popup, vanished and covered links are settled; finish_run completes', async () => {
  const run = await startRun(gs.call, PORTAL, 'guest', {
    focus: { start_url: `${SCAR_BASE}/sc07/`, only_paths: ['/sc07/*'] },
  });
  await scarNav(gs.call, run, '/sc07/');
  const handed = await drain(run, 30);
  const repeats = handed.filter((id, i) => handed.indexOf(id) !== i);
  expect(repeats, 'items handed out twice').toEqual([]);
  const finish = await gs.call('finish_run', { run_id: run, rationale: 'gate step' });
  expect(finish.isError, JSON.stringify(finish.body)).toBe(false);
  const items = rows<{ name: string | null; url: string | null; status: string; reason: string }>(
    gs,
    `SELECT json_extract(action_json, '$.accessible_name') AS name,
            json_extract(action_json, '$.url') AS url, status, reason
       FROM frontier WHERE run_id = ?`,
    run,
  );
  // The chat pop-up's URL was queued and visited.
  expect(items.find((i) => i.url?.endsWith('/sc07/chat'))?.status).toBe('done');
  for (const name of ['Spring promotion', 'Downloads'])
    expect(
      items.filter((i) => i.name === name).every((i) => i.status === 'unreachable' && i.reason),
      name,
    ).toBe(true);
  expect(items.filter((i) => i.status === 'pending')).toEqual([]);
});
