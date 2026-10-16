import { afterAll, beforeAll, expect } from 'vitest';
import {
  actOn,
  gate,
  gateServer,
  lastVisit,
  SCAR_BASE,
  scarNav,
  startRun,
  type Body,
  type GateServer,
} from '../src/index.js';

/**
 * Re-rendering SPA tiles (spec 030 R-57, SC-06, field C-3/C-4): the click must land on the tile it
 * means after the list re-rendered, and a slow role-less tile must get time to become clickable.
 */
let gs: GateServer;

beforeAll(async () => {
  gs = await gateServer({ portals: ['scar-maker'] });
});
afterAll(async () => {
  await gs?.close();
});

const landed = (r: Body) => lastVisit(gs, r.state_id as string).url;

// On master before spec 030 the re-rendered tiles already landed right (the path locator checks the
// name); the slow tile failed its 5 s trial (C-4). Text-first location (C-3) is kept as a safeguard.
gate(
  'SC-06',
  'a re-rendered tile is clicked by its text; a slow tile gets time',
  async () => {
    const run = await startRun(gs.call, 'scar-maker', 'guest');
    for (const name of ['Claims', 'Documents', 'Policies']) {
      const page = await scarNav(gs.call, run, '/sc06/');
      // The list re-renders every second: by the time the click comes, the order has changed.
      await new Promise((r) => setTimeout(r, 1500));
      const after = await actOn(gs.call, run, page, name);
      expect(landed(after), name).toBe(`${SCAR_BASE}/sc06/${name.toLowerCase()}`);
    }
    const page = await scarNav(gs.call, run, '/sc06/');
    const reports = await actOn(gs.call, run, page, 'Reports');
    expect(landed(reports)).toBe(`${SCAR_BASE}/sc06/reports`);
  },
  { timeout: 120_000 },
);
