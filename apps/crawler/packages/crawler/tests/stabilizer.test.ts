import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { settle, settleWithDiagnostics, trackNetworkActivity } from '../src/stabilizer.js';
import { browserAvailable, launch } from './browser.js';

const available = await browserAvailable();
let browser: Browser;
beforeAll(async () => {
  if (available) browser = await launch();
});
afterAll(async () => browser?.close());

describe.skipIf(!available)('stabilizer', () => {
  const run = async (html: string, opts = {}) => {
    const page = await browser.newPage();
    const net = trackNetworkActivity(page);
    await page.setContent(html);
    const t0 = Date.now();
    const result = await settle(page, net, {
      networkIdleMs: 100,
      domQuietMs: 100,
      timeoutMs: 2000,
      pollMs: 20,
      ...opts,
    });
    const ms = Date.now() - t0;
    const text = await page.locator('body').innerText();
    await page.close();
    return { result, ms, text };
  };

  it('settles quickly on a static page', async () => {
    const r = await run('<h1>Static</h1>');
    expect(r.result).toBe('settled');
    expect(r.ms).toBeLessThan(1500);
  });

  it('waits for late DOM mutations instead of a fixed sleep', async () => {
    const r = await run(
      '<div id="x">loading</div><script>setTimeout(()=>{document.getElementById("x").textContent="loaded"}, 250)</script>',
      { domQuietMs: 400 },
    );
    expect(r.result).toBe('settled');
    expect(r.text).toBe('loaded');
  });

  it('waits for a running finite CSS animation', async () => {
    const r = await run(
      '<style>@keyframes f{from{opacity:0}to{opacity:1}} #a{animation:f 600ms linear 1}</style><div id="a">x</div>',
      { domQuietMs: 50 },
    );
    expect(r.result).toBe('settled');
    expect(r.ms).toBeGreaterThanOrEqual(400);
  });

  it('flags never_stabilized when the DOM keeps mutating past the hard timeout', async () => {
    const r = await run(
      '<div id="c">0</div><script>let n=0;setInterval(()=>{document.getElementById("c").textContent=++n},20)</script>',
      { timeoutMs: 600 },
    );
    expect(r.result).toBe('never_stabilized');
  });

  it('does not treat an infinite animation as unsettled forever', async () => {
    const r = await run(
      '<style>@keyframes s{to{transform:rotate(1turn)}} #s{animation:s 1s linear infinite}</style><div id="s">spin</div>',
    );
    expect(r.result).toBe('settled');
  });
});

describe.skipIf(!available)('stabilizer diagnostics', () => {
  const ORIGIN = 'https://stab.test';
  const fast = { networkIdleMs: 100, domQuietMs: 100, pollMs: 20 };

  /** Serves `html` at ORIGIN/; `/hang` never answers; `/fail` is aborted. */
  const open = async (html: string, onFailed?: (f: unknown) => void) => {
    const page = await browser.newPage();
    await page.route(`${ORIGIN}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: html });
      if (path === '/fail') return route.abort('failed');
      if (path === '/ok') return route.fulfill({ contentType: 'application/json', body: '{}' });
      // '/hang': leave it pending
    });
    const net = trackNetworkActivity(page, Date.now, onFailed ? { onRequestFailed: onFailed } : {});
    await page.goto(`${ORIGIN}/`);
    return { page, net };
  };

  it('lists in-flight requests with type and age', async () => {
    const { page, net } = await open(`<script>fetch('${ORIGIN}/hang')</script>`);
    await page.waitForTimeout(50);
    const inFlight = net.inFlightRequests();
    expect(inFlight).toEqual([
      { url: `${ORIGIN}/hang`, resourceType: 'fetch', ageMs: expect.any(Number) },
    ]);
    expect(inFlight[0]!.ageMs).toBeGreaterThanOrEqual(0);
    await page.close();
  });

  it('drops finished requests from the in-flight list', async () => {
    const { page, net } = await open(`<script>fetch('${ORIGIN}/ok')</script>`);
    await page.waitForTimeout(100);
    expect(net.inFlightRequests()).toEqual([]);
    await page.close();
  });

  it('on timeout names the requests still in flight', async () => {
    const { page, net } = await open(`<script>fetch('${ORIGIN}/hang')</script>`);
    const out = await settleWithDiagnostics(page, net, { ...fast, timeoutMs: 400 });
    expect(out.result).toBe('never_stabilized');
    expect(out.waitedMs).toBeGreaterThanOrEqual(400);
    expect(out.diagnostics?.inFlight.map((r) => r.url)).toEqual([`${ORIGIN}/hang`]);
    await page.close();
  });

  it('on timeout reports a DOM that keeps changing', async () => {
    const { page, net } = await open(
      '<div id="c">0</div><script>let n=0;setInterval(()=>{document.getElementById("c").textContent=++n},20)</script>',
    );
    const out = await settleWithDiagnostics(page, net, { ...fast, timeoutMs: 400 });
    expect(out.result).toBe('never_stabilized');
    expect(out.diagnostics).toMatchObject({ inFlight: [], runningAnimations: 0 });
    expect(out.diagnostics!.sinceMutationMs).toBeLessThan(100);
    await page.close();
  });

  it('returns no diagnostics when the page settles', async () => {
    const { page, net } = await open('<h1>ok</h1>');
    const out = await settleWithDiagnostics(page, net, { ...fast, timeoutMs: 2000 });
    expect(out).toEqual({ result: 'settled', waitedMs: expect.any(Number) });
    await page.close();
  });

  it('reports failed requests', async () => {
    const failed: unknown[] = [];
    const { page } = await open(`<script>fetch('${ORIGIN}/fail').catch(()=>{})</script>`, (f) =>
      failed.push(f),
    );
    await page.waitForTimeout(100);
    expect(failed).toEqual([
      { url: `${ORIGIN}/fail`, resourceType: 'fetch', failure: expect.any(String) },
    ]);
    await page.close();
  });
});
