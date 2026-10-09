import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext } from 'playwright';
import { installClickSignals } from '../src/click-signals.js';
import { readClickables, selectClickables, type RawClickable } from '../src/clickables.js';
import { browserAvailable, launch } from './browser.js';

const raw = (over: Partial<RawClickable>): RawClickable => ({
  parent: -1,
  found_by: ['cursor'],
  tag: 'div',
  name: 'x',
  text: 'x',
  path: 'body > div:nth-child(1)',
  form: null,
  role_texts: [],
  ...over,
});

describe('selectClickables (pure)', () => {
  it('keeps a lone clickable div with its signals in a fixed order', () => {
    const s = selectClickables([raw({ found_by: ['tabindex', 'listener'], name: 'Wykonaj' })], 10);
    expect(s.issued).toEqual([
      {
        found_by: ['listener', 'tabindex'],
        tag: 'div',
        name: 'Wykonaj',
        path: 'body > div:nth-child(1)',
        form: null,
      },
    ]);
    expect(s).toMatchObject({ found: 1, capped: 0 });
  });

  it('drops a delegation container (listener only, several clickables inside)', () => {
    const s = selectClickables(
      [
        raw({ found_by: ['listener'], name: 'root', text: 'A B' }),
        raw({ parent: 0, name: 'A', text: 'A' }),
        raw({ parent: 0, name: 'B', text: 'B' }),
      ],
      10,
    );
    expect(s.issued.map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('keeps a pointer-cursor card that holds several clickables (capture more)', () => {
    const s = selectClickables(
      [
        raw({ found_by: ['cursor'], name: 'card', text: 'A B' }),
        raw({ parent: 0, name: 'A', text: 'A' }),
        raw({ parent: 0, name: 'B', text: 'B' }),
      ],
      10,
    );
    expect(s.issued.map((c) => c.name)).toEqual(['card', 'A', 'B']);
  });

  it('leaves a wrapper around a link to the link (AS1.4)', () => {
    const s = selectClickables([raw({ text: 'Szczegóły', role_texts: ['Szczegóły'] })], 10);
    expect(s.issued).toEqual([]);
  });

  it('a wrapper around one inner clickable with the same text gives way to it, signals merged', () => {
    const s = selectClickables(
      [
        raw({
          found_by: ['listener'],
          name: 'Dodaj',
          text: 'Dodaj',
          path: 'body > div:nth-child(1)',
        }),
        raw({
          parent: 0,
          found_by: ['cursor'],
          name: 'Dodaj',
          text: 'Dodaj',
          tag: 'span',
          path: 'p',
        }),
      ],
      10,
    );
    expect(s.issued).toEqual([
      { found_by: ['listener', 'cursor'], tag: 'span', name: 'Dodaj', path: 'p', form: null },
    ]);
  });

  it('caps in document order and counts the rest', () => {
    const many = Array.from({ length: 5 }, (_, i) => raw({ name: `n${i}`, text: `n${i}` }));
    const s = selectClickables(many, 3);
    expect(s.issued.map((c) => c.name)).toEqual(['n0', 'n1', 'n2']);
    expect(s).toMatchObject({ found: 5, capped: 2 });
  });
});

const available = await browserAvailable();
let browser: Browser;
let context: BrowserContext;

beforeAll(async () => {
  if (!available) return;
  browser = await launch();
  context = await browser.newContext();
  await installClickSignals(context);
});
afterAll(async () => {
  await browser?.close();
});

const PAGE = `<!doctype html><body>
<h1>Produkt</h1>
<div id="add" class="mk-c-9f2">Dodaj do koszyka</div>
<span style="cursor:pointer">Ulubione</span>
<li onclick="void 0">Pozycja</li>
<div tabindex="0">Fokus</div>
<a href="/x"><span style="cursor:pointer">W linku</span></a>
<div id="react">React</div>
<div style="display:none" onclick="void 0">Ukryty</div>
<form aria-label="Przelew"><div id="go">Wykonaj</div></form>
<div id="toasts" style="height:30px"></div>
<div id="icon" style="cursor:pointer;width:20px;height:20px"><svg width="10" height="10"></svg></div>
<script>
  document.getElementById('toasts').addEventListener('click', () => {});
  document.getElementById('add').addEventListener('click', () => {});
  document.getElementById('go').addEventListener('click', () => {});
  document.getElementById('react').__reactProps$x1 = { onClick() {} };
</script>`;

describe.skipIf(!available)('readClickables (browser)', () => {
  it('finds role-less clickables by each signal, with name, path and form', async () => {
    const page = await context.newPage();
    await page.setContent(PAGE);
    const found = await readClickables(page);
    await page.close();
    const named = (n: string): RawClickable => found.find((c) => c.name === n)!;
    // the empty listener container (#toasts) shows nothing: not a clickable; the icon is one
    expect(found.map((c) => c.name ?? '<icon>').sort()).toEqual(
      ['<icon>', 'Dodaj do koszyka', 'Fokus', 'Pozycja', 'React', 'Ulubione', 'Wykonaj'].sort(),
    );
    expect(named('Dodaj do koszyka').found_by).toEqual(['listener']);
    expect(named('Ulubione').found_by).toEqual(['cursor']);
    expect(named('Pozycja').found_by).toContain('inline');
    expect(named('Fokus').found_by).toEqual(['tabindex']);
    expect(named('React').found_by).toEqual(['framework']);
    expect(named('Wykonaj').form).toBe('Przelew');
    // no classes or ids in the path (LO-13, LO-14)
    expect(named('Dodaj do koszyka').path).toBe('body > div:nth-child(2)');
  });
});
