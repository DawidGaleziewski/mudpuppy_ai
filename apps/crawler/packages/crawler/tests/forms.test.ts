import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { extractForms } from '../src/forms.js';
import { browserAvailable, launch } from './browser.js';

const available = await browserAvailable();
let browser: Browser;

beforeAll(async () => {
  if (available) browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

async function fieldsOf(html: string) {
  const page = await browser.newPage();
  try {
    await page.setContent(`<!doctype html><title>t</title>${html}`);
    const forms = await extractForms(page);
    return forms[0]?.fields ?? [];
  } finally {
    await page.close();
  }
}

describe.skipIf(!available)('extractForms field naming (browser)', () => {
  it('names placeholder-only React-like inputs by their placeholder', async () => {
    const fields = await fieldsOf(`<form>
      <div class="row"><input placeholder="Numer rachunku"></div>
      <div class="row"><input type="number" placeholder="Kwota"></div>
      <button type="submit">Wyślij</button></form>`);
    expect(fields.map((f) => [f.name, f.name_source, f.label, f.type])).toEqual([
      ['Numer rachunku', 'placeholder', 'Numer rachunku', 'text'],
      ['Kwota', 'placeholder', 'Kwota', 'number'],
    ]);
  });

  it('names a control by the text in the previous table cell', async () => {
    const fields = await fieldsOf(`<form><table><tr>
      <td> Data   zdarzenia </td><td><input></td></tr></table></form>`);
    expect(fields).toEqual([
      expect.objectContaining({
        name: 'Data zdarzenia',
        name_source: 'nearby_text',
        label: 'Data zdarzenia',
      }),
    ]);
  });

  it('uses the nearest preceding text in the same wrapper', async () => {
    const fields = await fieldsOf(
      `<form><div><span>Opis szkody</span><textarea></textarea></div></form>`,
    );
    expect(fields[0]).toMatchObject({ name: 'Opis szkody', name_source: 'nearby_text' });
  });

  it('keeps the name attribute and records the label separately', async () => {
    const fields = await fieldsOf(`<form>
      <label for="e">Adres e-mail</label><input id="e" name="email" type="email" required></form>`);
    expect(fields).toEqual([
      {
        name: 'email',
        name_source: 'name',
        label: 'Adres e-mail',
        type: 'email',
        required: true,
        validation_messages: [expect.any(String)],
      },
    ]);
  });

  it('keeps the id as the name and tags it', async () => {
    const fields = await fieldsOf(`<form><input id="pesel" placeholder="PESEL"></form>`);
    expect(fields[0]).toMatchObject({ name: 'pesel', name_source: 'id', label: 'PESEL' });
  });

  it('reads aria-label and aria-labelledby', async () => {
    const fields = await fieldsOf(`<form>
      <input aria-label="Kod pocztowy">
      <span id="h">Miasto</span><input aria-labelledby="h"></form>`);
    expect(fields.map((f) => [f.name, f.name_source])).toEqual([
      ['Kod pocztowy', 'aria'],
      ['Miasto', 'aria'],
    ]);
  });

  it('prefers the text next to a field over a format-only placeholder', async () => {
    const fields = await fieldsOf(`<form>
      <div>Kod pocztowy <input placeholder="00-000"></div>
      <div><input placeholder="__-___"></div></form>`);
    expect(fields.map((f) => [f.name, f.name_source])).toEqual([
      ['Kod pocztowy', 'nearby_text'],
      ['__-___', 'placeholder'],
    ]);
  });

  it('falls back to field_<n> for a nameless, unlabeled control', async () => {
    const fields = await fieldsOf(`<form><input></form>`);
    expect(fields).toEqual([
      { name: 'field_1', name_source: 'position', type: 'text', required: false },
    ]);
  });

  it('still skips hidden, submit, button, image and reset inputs', async () => {
    const fields = await fieldsOf(`<form><input type="hidden"><input type="submit">
      <input type="button"><input type="image"><input type="reset"><button>x</button></form>`);
    expect(fields).toEqual([]);
  });
});

async function formsOf(html: string) {
  const page = await browser.newPage();
  try {
    await page.setContent(`<!doctype html><title>t</title>${html}`);
    return await extractForms(page);
  } finally {
    await page.close();
  }
}

describe.skipIf(!available)('extractForms div forms (browser, spec 015 FR-008)', () => {
  it('records inputs outside any <form> as one div_form per container with a submit', async () => {
    const forms = await formsOf(`
      <section><h2>Dane do wysyłki</h2>
        <div><input placeholder="Imię"></div><div><input placeholder="Miasto"></div>
        <div style="cursor:pointer">Zamawiam</div></section>
      <aside><input type="email" placeholder="E-mail"><button>Zapisz się</button></aside>`);
    expect(forms.map((f) => [f.kind, f.name, f.fields.map((x) => x.name)])).toEqual([
      ['div_form', 'Dane do wysyłki', ['Imię', 'Miasto']],
      ['div_form', '', ['E-mail']],
    ]);
  });

  it('lists real forms first and never puts their fields into a div_form', async () => {
    const forms = await formsOf(`<form aria-label="Logowanie"><input name="login"></form>
      <div><input placeholder="Szukaj"><button>Szukaj</button></div>`);
    expect(forms.map((f) => [f.kind ?? 'form', f.fields.map((x) => x.name)])).toEqual([
      ['form', ['login']],
      ['div_form', ['Szukaj']],
    ]);
  });
});
