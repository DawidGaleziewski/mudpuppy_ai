import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { NavigationRecorder } from '../src/navigation-recorder.js';
import { browserAvailable, launch } from './browser.js';

const available = await browserAvailable();

const PAGES: Record<string, string> = {
  '/home': '<title>home</title><a id="go" href="/chain?cat=7">old</a>',
  '/end': '<title>end</title>end',
  '/wait': '<title>wait</title><meta http-equiv="refresh" content="0;url=/old/7">Proszę czekać…',
  '/old/7': `<title>old</title><script>location.replace('/app#/polisy/7')</script>`,
  '/app': '<title>app</title>app',
  '/spa': `<title>spa</title><button id="push" onclick="history.pushState({}, '', '/spa/next?tab=2')">push</button><a id="hash" href="#/b">b</a>`,
};

describe.skipIf(!available)('NavigationRecorder (spec 019 R4)', () => {
  let browser: Browser;
  let server: Server;
  let base = '';
  beforeAll(async () => {
    browser = await launch();
    server = createServer((req, res) => {
      const path = (req.url ?? '/').split('?')[0]!;
      if (path === '/chain') {
        res.statusCode = 301;
        res.setHeader('location', '/mid/7');
        return res.end();
      }
      if (path === '/mid/7') {
        res.statusCode = 302;
        res.setHeader('location', '/end?kategoria=7');
        return res.end();
      }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(PAGES[path] ?? '<title>x</title>x');
    }).listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  async function recorded(): Promise<{ page: Page; rec: NavigationRecorder }> {
    const page = await browser.newPage();
    const rec = new NavigationRecorder(page);
    await rec.ready;
    return { page, rec };
  }

  it('records an HTTP redirect chain after a navigate, with statuses, without repeating the start', async () => {
    const { page, rec } = await recorded();
    rec.begin(`${base}/chain?cat=7`);
    await page.goto(`${base}/chain?cat=7`);
    expect(await rec.drain()).toEqual([
      { url: `${base}/chain?cat=7`, kind: 'start' },
      { url: `${base}/mid/7`, kind: 'http', status: 301 },
      { url: `${base}/end?kategoria=7`, kind: 'http', status: 302 },
    ]);
    await page.close();
  });

  it("records an action's own load, then the chain it set off", async () => {
    const { page, rec } = await recorded();
    await page.goto(`${base}/home`);
    rec.begin(page.url());
    await page.click('#go');
    await page.waitForURL('**/end?kategoria=7');
    expect((await rec.drain()).map((h) => h.kind)).toEqual(['start', 'navigate', 'http', 'http']);
    await page.close();
  });

  it('tells a meta refresh from the script redirect that follows it', async () => {
    const { page, rec } = await recorded();
    rec.begin(`${base}/wait`);
    await page.goto(`${base}/wait`);
    await page.waitForURL('**/app#/polisy/7');
    expect(await rec.drain()).toEqual([
      { url: `${base}/wait`, kind: 'start' },
      { url: `${base}/old/7`, kind: 'meta_refresh' },
      { url: `${base}/app#/polisy/7`, kind: 'script' },
    ]);
    await page.close();
  });

  it('records history-API and hash changes as same-document hops, and a reload', async () => {
    const { page, rec } = await recorded();
    await page.goto(`${base}/spa`);
    rec.begin(page.url());
    await page.click('#push');
    await page.waitForURL('**/spa/next?tab=2');
    await page.click('#hash');
    await page.waitForURL('**#/b');
    await page.reload();
    expect(await rec.drain()).toEqual([
      { url: `${base}/spa`, kind: 'start' },
      { url: `${base}/spa/next?tab=2`, kind: 'same_document' },
      { url: `${base}/spa/next?tab=2#/b`, kind: 'same_document' },
      { url: `${base}/spa/next?tab=2#/b`, kind: 'reload' },
    ]);
    await page.close();
  });

  it('marks a navigation the gate refused as blocked, with the reason', async () => {
    const { page, rec } = await recorded();
    await page.route('**/forbidden*', (r) => r.abort('blockedbyclient'));
    await page.goto(`${base}/home`);
    rec.begin(page.url());
    await page.goto(`${base}/forbidden?x=1`).catch(() => undefined);
    expect(await rec.drain()).toEqual([
      { url: `${base}/home`, kind: 'start' },
      {
        url: `${base}/forbidden?x=1`,
        kind: 'blocked',
        reason: 'refused by the request gate (scope or robots.txt)',
      },
    ]);
    await page.close();
  });
});
