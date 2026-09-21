import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { registerObstacleHandlers } from '../src/index.js';

const available = await chromium
  .launch()
  .then((b) => b.close().then(() => true))
  .catch(() => false);
let browser: Browser;
beforeAll(async () => {
  if (available) browser = await chromium.launch();
});
afterAll(async () => browser?.close());

const PAGE = `
<div id="cookie-consent"><button data-accept onclick="this.parentElement.remove()">Odrzuć</button></div>
<div class="promo-modal"><button class="close" onclick="this.parentElement.remove()">x</button></div>
<button id="go" onclick="document.body.insertAdjacentHTML('beforeend','<p id=done>clicked</p>')">Go</button>`;
const OBSTACLES = [
  { id: 'cookie_banner', selector: '#cookie-consent button[data-accept]' },
  { id: 'promo_popup', selector: '.promo-modal .close' },
  { id: 'never_present', selector: '.does-not-exist' },
];

describe.skipIf(!available)('obstacle handlers', () => {
  it('sweep dismisses every visible obstacle from config and reports them', async () => {
    const page = await browser.newPage();
    await page.setContent(PAGE);
    const h = await registerObstacleHandlers(page, OBSTACLES);
    const events = await h.sweep();
    expect(events.map((e) => e.id).sort()).toEqual(['cookie_banner', 'promo_popup']);
    expect(await page.locator('#cookie-consent, .promo-modal').count()).toBe(0);
    expect(await h.sweep()).toEqual([]);
    await page.close();
  });

  it('sweep is fast even though a handler watches the same selector (no self-interception timeout)', async () => {
    const page = await browser.newPage();
    await page.setContent(PAGE);
    const h = await registerObstacleHandlers(page, OBSTACLES, { clickTimeoutMs: 2000 });
    const t0 = Date.now();
    await h.sweep();
    expect(Date.now() - t0).toBeLessThan(1000);
    // handlers are back in place after the sweep
    await page.setContent(PAGE);
    await page.locator('#go').click({ timeout: 3000 });
    expect(h.events.some((e) => e.via === 'handler')).toBe(true);
    await page.close();
  });

  it('the locator handler dismisses an obstacle that would block a click', async () => {
    const page = await browser.newPage();
    await page.setContent(
      `<div style="position:fixed;inset:0;background:#fff" id="cookie-consent"><button data-accept onclick="this.parentElement.remove()">Odrzuć</button></div><button id="go" onclick="document.body.insertAdjacentHTML('beforeend','<p id=done>clicked</p>')">Go</button>`,
    );
    const h = await registerObstacleHandlers(page, OBSTACLES);
    await page.locator('#go').click({ timeout: 5000 });
    await page.locator('#done').waitFor();
    expect(h.events.some((e) => e.id === 'cookie_banner' && e.via === 'handler')).toBe(true);
    await page.close();
  });

  it('never fails a step when a selector matches nothing or the click fails', async () => {
    const page = await browser.newPage();
    await page.setContent(
      '<p>plain</p><div id="cookie-consent" style="display:none"><button data-accept>x</button></div>',
    );
    const h = await registerObstacleHandlers(page, OBSTACLES, { clickTimeoutMs: 200 });
    await expect(h.sweep()).resolves.toEqual([]);
    await h.dispose();
    await page.close();
  });

  it('is driven purely by config: an empty list registers nothing', async () => {
    const page = await browser.newPage();
    await page.setContent(PAGE);
    const h = await registerObstacleHandlers(page, []);
    expect(await h.sweep()).toEqual([]);
    expect(await page.locator('#cookie-consent').count()).toBe(1);
    await page.close();
  });
});
