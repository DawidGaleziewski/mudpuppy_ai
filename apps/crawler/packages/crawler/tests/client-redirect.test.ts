import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { followClientRedirects, readMetaRefresh } from '../src/client-redirect.js';
import { NavigationRecorder } from '../src/navigation-recorder.js';
import { browserAvailable, launch } from './browser.js';

const available = await browserAvailable();

const PAGES: Record<string, string> = {
  // Browsers read a refresh delay as whole seconds ("0.3" is 0), so the test uses 0.
  '/wait': '<title>wait</title><meta http-equiv="refresh" content="0;url=/old/7">Proszę czekać…',
  '/old/7': `<title>old</title><script>location.replace('/app#/polisy/7')</script>`,
  '/app': '<title>app</title>Szczegóły polisy',
  '/slow': '<title>slow</title><meta http-equiv="refresh" content="30;url=/logout">Sesja wygaśnie',
  '/self': '<title>self</title><meta http-equiv="refresh" content="1">kursy walut',
  '/loop': '<title>loop</title><meta http-equiv="refresh" content="0;url=/loop2">',
  '/loop2': '<title>loop2</title><meta http-equiv="refresh" content="0;url=/loop">',
  '/plain': '<title>plain</title>plain',
};

describe.skipIf(!available)('followClientRedirects (spec 019 FR-007, LO-23)', () => {
  let browser: Browser;
  let server: Server;
  let base = '';
  beforeAll(async () => {
    browser = await launch();
    server = createServer((req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(PAGES[(req.url ?? '/').split('?')[0]!] ?? '<title>x</title>x');
    }).listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  async function opened(path: string): Promise<{ page: Page; rec: NavigationRecorder }> {
    const page = await browser.newPage();
    const rec = new NavigationRecorder(page);
    await rec.ready;
    rec.begin(`${base}${path}`);
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    return { page, rec };
  }
  const opts = (rec: NavigationRecorder) => ({
    maxWaitMs: 5000,
    navigating: () => rec.navigating(),
  });

  it('reads a meta refresh, resolving its target', async () => {
    const { page } = await opened('/slow');
    expect(await readMetaRefresh(page)).toEqual({ delayMs: 30_000, target: `${base}/logout` });
    await page.goto(`${base}/plain`);
    expect(await readMetaRefresh(page)).toBeNull();
    await page.close();
  });

  it('passes an interstitial: meta refresh, then a script redirect, to the final screen', async () => {
    const { page, rec } = await opened('/wait');
    const r = await followClientRedirects(page, opts(rec));
    expect(page.url()).toBe(`${base}/app#/polisy/7`);
    expect(r.followed).toBeGreaterThanOrEqual(1);
    expect((await rec.drain()).map((h) => h.kind)).toEqual(['start', 'meta_refresh', 'script']);
    await page.close();
  });

  it('does not wait for a slow refresh or a self-refresh, but reports it', async () => {
    const slow = await opened('/slow');
    expect(await followClientRedirects(slow.page, opts(slow.rec))).toEqual({
      followed: 0,
      pending: { delayMs: 30_000, target: `${base}/logout` },
      capped: false,
    });
    await slow.page.close();
    const self = await opened('/self');
    const r = await followClientRedirects(self.page, opts(self.rec));
    expect(r.followed).toBe(0);
    expect(r.pending?.target).toBe(`${base}/self`);
    await self.page.close();
  });

  it('stops a redirect loop at the hop cap', async () => {
    const { page, rec } = await opened('/loop');
    const r = await followClientRedirects(page, { ...opts(rec), maxHops: 3 });
    expect(r).toMatchObject({ followed: 3, capped: true });
    await page.close();
  });

  it('returns at once on a page without client redirects', async () => {
    const { page, rec } = await opened('/plain');
    const started = Date.now();
    expect(await followClientRedirects(page, opts(rec))).toEqual({
      followed: 0,
      pending: null,
      capped: false,
    });
    expect(Date.now() - started).toBeLessThan(500);
    await page.close();
  });
});
