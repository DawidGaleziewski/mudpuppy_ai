import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect } from 'vitest';
import {
  actionNamed,
  gate,
  gateServer,
  resetScars,
  SCAR_BASE,
  scarNav,
  snapshot,
  startRun,
  type GateServer,
} from '../src/index.js';

/**
 * Fix-plugins (spec 030 R-59) against their scars: the portal turns each fix on in `fixes:` with
 * the client's data; without it the scar shows (plain server), with it the content is there.
 */
const PORTAL = 'scar-maker';

const FIXES = `
fixes:
  - use: seed-cookie
    with: { cookies: [{ name: sm_show_services, value: "1" }] }
  - use: expand-collapsed
    match: "/sc09/*"
  - use: expand-collapsed
    match: "/sc10/*"
    with: { toggles: ['dl dt > a[href="#"]'] }
  - use: wait-for-mount
    match: "/sc11/*"
    with: { selector: ".x-widget-host form", wait_ms: 6000 }
`;

let fixed: GateServer;
let plain: GateServer;

beforeAll(async () => {
  await resetScars();
  fixed = await gateServer({
    portals: [PORTAL],
    extra: (root) => appendFileSync(join(root, 'portals', PORTAL, 'portal.yaml'), FIXES),
  });
  plain = await gateServer({ portals: [PORTAL] });
});
afterAll(async () => {
  await fixed?.close();
  await plain?.close();
});

const page = async (gs: GateServer, path: string) => {
  const run = await startRun(gs.call, PORTAL, 'guest');
  const p = await scarNav(gs.call, run, path);
  return { p, aria: snapshot(gs, p.state_id as string) };
};

gate('SC-08', 'seed-cookie: a flag-cookie list is shown and its links issued', async () => {
  expect((await page(plain, '/sc08/')).aria).toContain('Nothing to show');
  const { p } = await page(fixed, '/sc08/');
  expect(actionNamed(p, 'Report a claim')).toBeDefined();
});

gate(
  'SC-09',
  'expand-collapsed: details, accordion and show-more links are observed; the form is never posted',
  async () => {
    expect(actionNamed((await page(plain, '/sc09/')).p, 'Travel insurance')).toBeUndefined();
    const { p } = await page(fixed, '/sc09/');
    for (const name of ['Car insurance', 'Home insurance', 'Travel insurance', 'Pet insurance'])
      expect(actionNamed(p, name), name).toBeDefined();
    expect(await (await fetch(`${SCAR_BASE}/__admin/sc09/posted`)).text()).toBe('0');
  },
);

gate(
  'SC-10',
  'expand-collapsed: sections open by default stay open, the closed one opens',
  async () => {
    const { p } = await page(fixed, '/sc10/');
    for (const name of ['Contract overview', 'Open claims', 'Tax certificate'])
      expect(actionNamed(p, name), name).toBeDefined();
  },
);

gate('SC-11', 'wait-for-mount: a late micro-frontend form is in the snapshot', async () => {
  expect((await page(plain, '/sc11/')).aria).not.toContain('Claim number');
  expect((await page(fixed, '/sc11/')).aria).toContain('Claim number');
});
