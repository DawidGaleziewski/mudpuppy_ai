import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { LoggedRequest, MockPortal } from './mock-portal.js';
import { SHARED_COOKIE_PAGE } from './shared-pages.js';

/**
 * A second, non-marketplace mock portal (spec 002 FR-020, research §12): an insurer with a
 * Cookiebot-style dialog, product pages, a multi-step quote form, campaign links carrying `cHash`,
 * an `/api/` call made by the page's own script, and its own robots.txt. Nothing in `src/` knows it.
 */
export interface MockInsurerOptions {
  /** How `/robots.txt` answers. */
  robots?: 'rules' | '404' | '503' | 'loop';
  /** Every page answers 403 after this many page requests (block-stop check); off by default. */
  blockAfter?: number;
}

export const INSURER_ROBOTS = [
  'User-agent: *',
  'Disallow: *cHash*',
  'Disallow: /quote/',
  'Allow: /quote/start*',
  'Disallow: /api/',
  // Faster than the tests' rate limit: it must never speed the crawler up.
  'Crawl-delay: 0.02',
  '',
  'User-agent: SomeOtherBot',
  'Disallow: /',
  '',
  'Sitemap: /sitemap.xml',
  '',
].join('\n');

const layout = (
  title: string,
  body: string,
): string => `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${title}</title></head><body>
<div id="CybotCookiebotDialog" role="dialog" aria-label="Zgody na cookie"><p>Używamy plików cookie.</p>
<button id="CybotCookiebotDialogBodyButtonDecline" onclick="this.parentElement.remove()">Odrzuć</button></div>
<header><nav aria-label="Menu główne">
<a href="/">Start</a>
<a href="/ubezpieczenia/samochod">Samochód</a>
<a href="/ubezpieczenia/dom">Dom</a>
<a href="/formularze-online/?itm_campaign=menu_formularze&cHash=02e3d5d3fa0ec3b1">Formularze online</a>
<a href="/emerytura/?itm_campaign=boks_ike&cHash=a8d0e747893bfb97">Emerytura</a>
<a href="/quote/start?itm_campaign=menu_cta">Oblicz składkę</a>
<a href="/quote/summary">Podsumowanie wyceny</a>
<a href="/porady/?sessionId=abc123">Porady (sesja)</a>
<a href="/porady/">Porady</a>
<a href="/cookies">Pliki cookie</a>
</nav></header>
<main>${body}</main>
<script>fetch('/api/prices').then(r => r.json()).catch(() => {})</script></body></html>`;

const product = (slug: string): string =>
  layout(
    `Ubezpieczenie ${slug}`,
    `<h1>Ubezpieczenie ${slug}</h1><p>Składka od 199 zł rocznie.</p>
<button>Kup polisę</button>
<button onclick="location.href='/przedluzenie/start'">Przedłuż polisę</button>
<button>Jetzt kaufen</button>
<a href="/quote/start?product=${slug}">Oblicz składkę</a>
<form aria-label="Zapytanie o ofertę" method="post" action="/zapytanie">
<label>E-mail <input name="email" type="email" required></label>
<button type="submit">Wyślij zapytanie</button></form>`,
  );

const quoteStart = (): string =>
  layout(
    'Oblicz składkę',
    `<h1>Oblicz składkę</h1><p>Krok 1 z 3</p>
<form aria-label="Kalkulator składki" method="get" action="/quote/step2">
<label>Rodzaj pojazdu <select name="vehicle" required><option>Samochód</option><option>Motocykl</option></select></label>
<label>Rok produkcji <input name="year" type="number" min="1950" max="2026" required></label>
<button type="submit">Dalej</button></form>`,
  );

export async function startMockInsurer(opts: MockInsurerOptions = {}): Promise<MockPortal> {
  const requests: LoggedRequest[] = [];
  let pages = 0;
  const server: Server = createServer((req: IncomingMessage, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    requests.push({
      method: req.method ?? 'GET',
      url: req.url ?? '/',
      userAgent: req.headers['user-agent'],
      at: Date.now(),
    });
    const send = (status: number, body: string, type = 'text/html; charset=utf-8'): void => {
      res.statusCode = status;
      res.setHeader('content-type', type);
      res.end(body);
    };
    const redirect = (to: string): void => {
      res.statusCode = 302;
      res.setHeader('location', to);
      res.end();
    };
    const p = url.pathname;

    if (p === '/robots.txt') {
      switch (opts.robots ?? 'rules') {
        case '404':
          return send(404, 'Not found', 'text/plain');
        case '503':
          return send(503, 'Service unavailable', 'text/plain');
        case 'loop':
          return redirect('/robots-loop/1');
        default:
          return send(200, INSURER_ROBOTS, 'text/plain');
      }
    }
    if (p.startsWith('/robots-loop/'))
      return redirect(`/robots-loop/${Number(p.split('/')[2]) + 1}`);
    if (p.startsWith('/api/'))
      return send(200, JSON.stringify({ prices: [199, 349] }), 'application/json');

    pages += 1;
    if (opts.blockAfter !== undefined && pages > opts.blockAfter)
      return send(403, '<html><body>Forbidden</body></html>');
    if (p === '/')
      return send(
        200,
        layout('Ubezpieczyciel', '<h1>Ubezpieczenia</h1><p>Wybierz produkt z menu.</p>'),
      );
    if (/^\/ubezpieczenia\/[a-z]+$/.test(p)) return send(200, product(p.split('/')[2]!));
    if (p === '/quote/start') return send(200, quoteStart());
    if (p.startsWith('/quote/')) return send(200, layout('Wycena', '<h1>Wycena</h1>'));
    if (p === '/porady/') return send(200, layout('Porady', '<h1>Porady</h1><p>Artykuły.</p>'));
    if (p === '/formularze-online/' || p === '/emerytura/')
      return send(200, layout('Kampania', '<h1>Kampania</h1>'));
    if (p === '/przedluzenie/start')
      return send(200, layout('Przedłużenie', '<h1>Przedłuż polisę</h1>'));
    if (p === '/cookies') return send(200, SHARED_COOKIE_PAGE);
    if (p === '/blocked') return send(403, '<html><body>Forbidden</body></html>');
    send(404, layout('Nie znaleziono', '<h1>Nie znaleziono</h1>'));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    host: '127.0.0.1',
    requests,
    hits: (prefix) => requests.filter((r) => r.url.startsWith(prefix)),
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
