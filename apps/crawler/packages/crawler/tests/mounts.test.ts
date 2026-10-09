import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { shouldWaitForMounts, waitForMounts } from '../src/mounts.js';
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
