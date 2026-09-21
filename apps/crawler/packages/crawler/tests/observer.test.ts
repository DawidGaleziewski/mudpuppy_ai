import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { NetworkRecorder } from '../src/network-recorder.js';
import { observePage } from '../src/observer.js';
import { browserAvailable, launch } from './browser.js';

const available = await browserAvailable();
let browser: Browser;
let server: Server;
let base = '';

const FORM_PAGE = `<!doctype html><title>Konto</title>
<h1>Konto</h1>
<form aria-label="Rejestracja" method="post" action="/rejestracja">
  <input name="email" type="email" required maxlength="80" placeholder="e-mail" value="secret.user@example.com">
  <input name="password" type="password" required minlength="8">
  <select name="city"><option>Warszawa</option><option>Kraków</option></select>
  <input name="age" type="number" min="18" max="99">
  <input type="hidden" name="csrf" value="tok">
  <button type="submit">Załóż konto</button>
</form>
<form role="search" action="/szukaj"><input name="q" type="search"><button>Szukaj</button></form>`;

beforeAll(async () => {
  if (!available) return;
  browser = await launch();
  server = createServer((req, res) => {
    if (req.url === '/form') {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(FORM_PAGE);
    } else if (req.url?.startsWith('/api/offers/123456')) {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          id: 123456,
          title: 'Laptop',
          seller: { email: 'jan@example.com', phone: '601 234 567' },
          tags: ['a'],
        }),
      );
    } else if (req.url === '/api/fail') {
      res.destroy();
    } else if (req.url === '/xhr') {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(`<title>x</title><script>
        fetch('/api/offers/123456?ref=1').then(r=>r.json());
        fetch('/api/search', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({q:'laptop dell', email:'jan@example.com'})}).catch(()=>{});
        fetch('/api/fail').catch(()=>{});
        console.error('Broken for jan@example.com');
      </script>`);
    } else {
      res.statusCode = 404;
      res.end('nope');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await browser?.close();
  server?.close();
});

describe.skipIf(!available)('observer', () => {
  it('extracts form field schemas without submitting or reading values', async () => {
    const page = await browser.newPage();
    let posted = false;
    page.on('request', (r) => {
      if (r.method() === 'POST') posted = true;
    });
    await page.goto(`${base}/form`);
    const obs = await observePage(page);
    expect(posted).toBe(false);
    expect(obs.title).toBe('Konto');
    const reg = obs.forms.find((f) => f.name === 'Rejestracja')!;
    expect(reg).toMatchObject({ method: 'POST', hasPassword: true, purpose: 'other' });
    const byName = Object.fromEntries(reg.fields.map((f) => [f.name, f]));
    expect(byName.email).toMatchObject({
      type: 'email',
      required: true,
      constraints: { maxlength: 80 },
    });
    expect(byName.password).toMatchObject({
      type: 'password',
      required: true,
      constraints: { minlength: 8 },
    });
    expect(byName.city).toMatchObject({ type: 'select', options: ['Warszawa', 'Kraków'] });
    expect(byName.age).toMatchObject({
      type: 'number',
      required: false,
      constraints: { min: 18, max: 99 },
    });
    expect(byName.csrf).toBeUndefined();
    expect(byName.password!.validation_messages?.length).toBeGreaterThan(0);
    expect(JSON.stringify(obs.forms)).not.toContain('secret.user@example.com');
    expect(obs.forms.find((f) => f.purpose === 'search')).toBeDefined();
    expect(obs.ariaSnapshot).toContain('button "Załóż konto"');
    await page.close();
  });

  it('records calls the page makes as shapes only, with console errors masked', async () => {
    const page = await browser.newPage();
    const rec = new NetworkRecorder(page);
    await page.goto(`${base}/xhr`);
    await page.waitForLoadState('networkidle');
    const { calls, console_errors } = await rec.drain();
    const offer = calls.find((c) => c.url_template.includes('offers'))!;
    expect(offer).toMatchObject({ method: 'GET', status: 200, url_template: '/api/offers/:param' });
    expect(offer.res_schema).toEqual({
      id: 'integer',
      title: 'string',
      seller: { email: 'string', phone: 'string' },
      tags: ['string'],
    });
    const search = calls.find((c) => c.url_template === '/api/search');
    if (search) expect(search.req_schema).toEqual({ q: 'string', email: 'string' });
    const all = JSON.stringify({ calls, console_errors });
    expect(all).not.toContain('jan@example.com');
    expect(all).not.toContain('601 234 567');
    expect(console_errors.some((e) => e.includes('Broken for [email]'))).toBe(true);
    expect(console_errors.some((e) => e.includes('/api/fail') && e.includes('failed'))).toBe(true);
    expect((await rec.drain()).calls).toEqual([]);
    rec.dispose();
    await page.close();
  });
});
