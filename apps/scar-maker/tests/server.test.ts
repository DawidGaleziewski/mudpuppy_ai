import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startScarMaker, type ScarMaker } from '../src/server.js';

// A port of its own: never the dev (4300) or gate (4400) instance.
const PORT = 4391;
let sm: ScarMaker;

beforeAll(async () => {
  sm = await startScarMaker(PORT);
});
afterAll(async () => {
  await sm.close();
});

describe('scar-maker server', () => {
  it('serves the index with a link to every scar on both hosts', async () => {
    for (const base of [sm.portal, sm.second]) {
      const body = await (await fetch(`${base}/`)).text();
      expect(body).toContain('href="/sc01/"');
    }
    expect(await (await fetch(`${sm.portal}/healthz`)).text()).toBe('ok');
  });

  it('keeps /__admin/ out of robots and resets per-scar memory', async () => {
    expect(await (await fetch(`${sm.portal}/robots.txt`)).text()).toContain('Disallow: /__admin/');
    await fetch(`${sm.portal}/sc05/nachricht?aktion=senden`);
    expect(await (await fetch(`${sm.portal}/__admin/sc05/sent`)).text()).toBe('1');
    await fetch(`${sm.portal}/__admin/reset`, { method: 'POST' });
    expect(await (await fetch(`${sm.portal}/__admin/sc05/sent`)).text()).toBe('0');
  });

  it('answers 403 for the SC-02 background call but 200 for its page', async () => {
    expect((await fetch(`${sm.portal}/sc02/`)).status).toBe(200);
    expect((await fetch(`${sm.portal}/sc02/api/flags`)).status).toBe(403);
  });

  it('answers 404 for an unknown path', async () => {
    expect((await fetch(`${sm.portal}/nope`)).status).toBe(404);
  });
});
