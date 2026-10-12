import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { shouldWaitForMounts, waitForMounts, waitForMountsIn } from '../src/mounts.js';
import { browserAvailable, launch } from './browser.js';

describe('shouldWaitForMounts (pure)', () => {
  it('waits only when a loader is present and a mount is empty', () => {
    const empty = [{ selector: '#root', filled: false }];
    expect(shouldWaitForMounts({ mounts: empty, loaders: ['importmap'], bundles: [] })).toBe(true);
    expect(shouldWaitForMounts({ mounts: empty, loaders: [], bundles: [] })).toBe(false);
    expect(
      shouldWaitForMounts({
        mounts: [{ selector: '#root', filled: true }],
        loaders: ['systemjs'],
        bundles: [],
      }),
    ).toBe(false);
  });
});

const available = await browserAvailable();
let browser: Browser;
let page: Page;
beforeAll(async () => {
  if (!available) return;
  browser = await launch();
  page = await browser.newPage();
});
afterAll(async () => {
  await browser?.close();
});

/** A shell whose micro-frontend renders into `[data-mfe]` some time after the shell settled. */
const shell = (delayMs: number) => `<!doctype html><body>
<script type="importmap">{"imports":{}}</script>
<header>Shell</header>
<div data-mfe="shop"><div></div></div>
<script>setTimeout(() => {
  document.querySelector('[data-mfe] > div').innerHTML = '<h1>Katalog</h1>';
}, ${delayMs});</script>`;

describe.skipIf(!available)('waitForMounts (browser)', () => {
  it('waits until the late micro-frontend has rendered, and records the mount and loader', async () => {
    await page.setContent(shell(400));
    const w = await waitForMounts(page, 5000, 25);
    expect(w.timedOut).toBe(false);
    expect(w.mounts).toEqual([{ selector: '[data-mfe="shop"]', filled: true }]);
    expect(w.loaders).toContain('importmap');
    expect(w.waitedMs).toBeGreaterThan(0);
  });

  it('gives up at the bound and says so', async () => {
    await page.setContent(shell(60_000));
    const w = await waitForMounts(page, 200, 25);
    expect(w.timedOut).toBe(true);
    expect(w.mounts[0]!.filled).toBe(false);
  });

  it('does not wait on a page without a run-time loader', async () => {
    await page.setContent('<!doctype html><body><div id="root"></div>');
    const w = await waitForMounts(page, 5000, 25);
    expect(w.timedOut).toBe(false);
    expect(w.waitedMs).toBeLessThan(1000);
  });
});

/** A wrapper page whose same-origin frame mounts its own front end late (spec 019 LO-53). */
const wrapper = (delayMs: number) => {
  const inner = `<script type="importmap">{"imports":{}}</script><div id="app"></div><script>setTimeout(() => { document.getElementById('app').innerHTML = '<h1>Lista operacji</h1>'; }, ${delayMs});</script>`;
  return `<!doctype html><body><header>Bank</header><iframe srcdoc="${inner.replace(/"/g, '&quot;')}"></iframe>`;
};
const childFrames = (p: Page) => () =>
  Promise.resolve(p.frames().filter((f) => f !== p.mainFrame()));

describe.skipIf(!available)('waitForMountsIn (browser, spec 019 LO-53)', () => {
  it('waits for a late mount inside a frame and reports the frame', async () => {
    await page.setContent(wrapper(400));
    const w = await waitForMountsIn(page, childFrames(page), 5000, 25);
    expect(w.frames).toHaveLength(1);
    expect(w.frames[0]!.probe.mounts).toEqual([{ selector: '#app', filled: true }]);
    expect(w.frames[0]!.timedOut).toBe(false);
    expect(await page.frames()[1]!.textContent('#app')).toBe('Lista operacji');
  });

  it('gives up at the bound and says which frame is still empty', async () => {
    await page.setContent(wrapper(60_000));
    const w = await waitForMountsIn(page, childFrames(page), 200, 25);
    expect(w.waitedMs).toBeGreaterThanOrEqual(200);
    expect(w.frames[0]!.timedOut).toBe(true);
    expect(w.timedOut).toBe(false); // the top document has nothing to wait for
  });
});
