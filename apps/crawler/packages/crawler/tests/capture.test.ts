import { Layout, elementKeys, parseAriaYaml } from '@mudpuppy/core';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureVisuals, pngSize } from '../src/capture.js';
import { captureAria } from '../src/observer.js';
import { browserAvailable, launch } from './browser.js';

const available = await browserAvailable();
let browser: Browser;

beforeAll(async () => {
  if (available) browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

const PAGE = `<!doctype html><title>Kalkulator</title>
<header><nav><a href="/">Start</a></nav></header>
<main><h1>Kalkulator OC/AC</h1>
<form aria-label="Dane"><label>Pojemność silnika <input name="cap" type="number"></label>
<button>Oblicz</button><button style="display:none">Ukryty</button></form>
<div style="height:1600px"></div><a href="/dol">Na dole</a></main>`;

describe.skipIf(!available)('captureVisuals (spec 008 research R1, R3)', () => {
  it('takes a full-page PNG at viewport width and keys boxes like the ARIA snapshot', async () => {
    const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
    await page.setContent(PAGE);
    await page.mouse.wheel(0, 400); // boxes must still be in page coordinates
    await page.waitForFunction(() => window.scrollY > 0);
    const yaml = await captureAria(page);
    const { png, layout } = await captureVisuals(page);
    await page.close();

    expect(Layout.parse(layout)).toEqual(layout);
    expect(pngSize(png)).toEqual(layout.page);
    expect(layout.page.width).toBe(1024);
    expect(layout.page.height).toBeGreaterThan(1600);
    expect(layout.cut).toBe(false);
    expect(layout.elements.map((e) => e.key)).toEqual(
      elementKeys(parseAriaYaml(yaml)).map((e) => e.key),
    );
    const heading = layout.elements.find((e) => e.key === 'heading "Kalkulator OC/AC"')!;
    expect(heading.box!.y).toBeLessThan(200); // near the top of the page, not shifted by the scroll
    const bottom = layout.elements.find((e) => e.key === 'link "Na dole"')!;
    expect(bottom.box!.y).toBeGreaterThan(1600);
    expect(layout.elements.some((e) => e.name === 'Ukryty')).toBe(false);
  });

  it('cuts a page taller than the maximum and records it', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(PAGE);
    const { png, layout } = await captureVisuals(page, { maxHeight: 1000 });
    await page.close();
    expect(layout.cut).toBe(true);
    expect(pngSize(png)).toEqual({ width: 800, height: 1000 });
    expect(layout.elements.find((e) => e.key === 'link "Na dole"')!.box).toBeNull();
  });
});
