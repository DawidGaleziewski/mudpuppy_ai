import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { autofillForm } from '../src/autofill.js';
import { browserAvailable, launch } from './browser.js';

const available = await browserAvailable();
let browser: Browser;
beforeAll(async () => {
  if (available) browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

const FORM = `<!doctype html><form aria-label="Dane pojazdu" action="/wynik">
  <label>Marka <select name="marka" required><option value="">— wybierz —</option><option value="toyota">Toyota</option></select></label>
  <label>Model <input name="model" required maxlength="40"></label>
  <label>Rok produkcji <input name="rok" type="number" min="1990" max="2026" required></label>
  <label>Kod pocztowy <input name="kod" required pattern="[0-9]{2}-[0-9]{3}"></label>
  <label>E-mail <input name="email" type="email"></label>
  <label>Uwagi <input name="uwagi" value="już wpisane"></label>
  <label><input type="checkbox" name="zgoda" required> Zgoda</label>
  <label><input type="radio" name="plan" value="a"> A</label><label><input type="radio" name="plan" value="b"> B</label>
  <button>Oblicz</button>
</form>
<button id="outside">Poza formularzem</button>
<form><button type="button">Tylko przycisk</button></form>`;

describe.skipIf(!available)('autofillForm (spec 008 FR-002)', () => {
  it('fills the empty fields so the form passes browser validation', async () => {
    const page = await browser.newPage();
    await page.setContent(FORM);
    const result = await autofillForm(page.getByRole('button', { name: 'Oblicz' }), {
      Model: 'Testowy',
    });
    expect(result!.filled.map((f) => [f.field, f.value])).toEqual([
      ['marka', 'toyota'],
      ['model', 'Testowy'],
      ['rok', '1990'],
      ['kod', '00-950'],
      ['email', 'test@example.test'],
      ['zgoda', 'checked'],
      ['plan', 'checked'],
    ]);
    expect(result!.skipped).toEqual([{ field: 'uwagi', reason: 'already filled' }]);
    expect(
      await page
        .locator('form')
        .first()
        .evaluate((f) => (f as HTMLFormElement).checkValidity()),
    ).toBe(true);
    expect(await page.locator('input[name=uwagi]').inputValue()).toBe('już wpisane');
    expect(await page.locator('input[name=plan][value=a]').isChecked()).toBe(true);
    await page.close();
  });

  it('touches nothing for a control that does not submit a form', async () => {
    const page = await browser.newPage();
    await page.setContent(FORM);
    expect(await autofillForm(page.locator('#outside'))).toBeNull();
    expect(await autofillForm(page.getByRole('button', { name: 'Tylko przycisk' }))).toBeNull();
    expect(await page.locator('input[name=model]').inputValue()).toBe('');
    await page.close();
  });

  it('fills the fields a div "Wykonaj" sends, in a form or in a div form (spec 015)', async () => {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html>
      <form><input placeholder="Kwota" type="number" required><div id="go">Wykonaj</div></form>
      <section><input placeholder="Miasto" required><div id="order">Zamawiam</div>
        <div id="prev">Poprzedni miesiąc</div></section>`);
    const inForm = await autofillForm(page.locator('#go'));
    expect(inForm!.filled.map((f) => f.field)).toEqual(['Kwota']);
    const inDiv = await autofillForm(page.locator('#order'));
    expect(inDiv!.filled.map((f) => f.field)).toEqual(['Miasto']);
    expect(await page.locator('input[placeholder=Miasto]').inputValue()).not.toBe('');
    // a click whose text does not read like a submit fills nothing
    expect(await autofillForm(page.locator('#prev'))).toBeNull();
    await page.close();
  });
});
