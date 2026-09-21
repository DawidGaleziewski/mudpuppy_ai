import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { settle, trackNetworkActivity } from '../src/stabilizer.js';
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
