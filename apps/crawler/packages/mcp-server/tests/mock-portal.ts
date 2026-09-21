import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface LoggedRequest {
  method: string;
  url: string;
  userAgent: string | undefined;
  at: number;
}

export interface MockPortal {
  origin: string;
  host: string;
  requests: LoggedRequest[];
  /** Requests made to pages (not assets/xhr), for convenience. */
  hits(pathPrefix: string): LoggedRequest[];
  close(): Promise<void>;
}

const layout = (
  title: string,
  body: string,
  script = '',
): string => `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${title}</title></head><body>
<div id="cookie"><button class="accept" onclick="this.parentElement.remove()">Odrzuć wszystkie</button></div>
<header><nav aria-label="Główna nawigacja"><a href="/">Start</a> <a href="/oferty">Oferty</a> <a href="/oferty/laptopy">Laptopy</a> <a href="/konto/zaloguj">Zaloguj się</a> <a href="/wyloguj">Wyloguj się</a></nav>
<form role="search" action="/szukaj" method="get"><input type="search" name="q" aria-label="Szukaj ofert"><button type="submit">Szukaj</button></form></header>
<main>${body}</main><footer><a href="http://ads.invalid/promo">Reklama</a></footer>${script}</body></html>`;

const listing = (title: string, ids: number[], extra = ''): string =>
  layout(
    title,
    `<h1>${title}</h1><ul>${ids.map((i) => `<li><a href="/oferta/${i}">Laptop model ${i}</a> <span>${1000 + i * 111} zł</span></li>`).join('')}</ul>${extra}<a href="/oferty?page=2">Następna strona</a>`,
    `<script>fetch('/api/offers').then(r=>r.json())</script>`,
  );

const item = (id: number): string =>
  layout(
    `Oferta ${id}`,
    `<h1>Laptop model ${id}</h1><p>Cena ${1000 + id * 111} zł</p>
<button data-testid="bid-btn">Licytuj</button> <button>Kup teraz</button> <button>Dodaj do ulubionych</button> <button>Pokaż numer telefonu</button>
<form aria-label="Zapytaj sprzedawcę" method="post" action="/wiadomosc"><label>Wiadomość <textarea name="body" required minlength="5"></textarea></label><button type="submit">Wyślij wiadomość</button></form>
<a href="/oferty" data-testid="back-to-list">Wróć do listy</a>`,
    `<script>fetch('/api/offers/${id}').then(r=>r.json())</script>`,
  );

export async function startMockPortal(): Promise<MockPortal> {
  const requests: LoggedRequest[] = [];
  const server: Server = createServer((req: IncomingMessage, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    requests.push({
      method: req.method ?? 'GET',
      url: req.url ?? '/',
      userAgent: req.headers['user-agent'],
      at: Date.now(),
    });
    const html = (b: string, status = 200): void => {
      res.statusCode = status;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(b);
    };
    const json = (o: unknown): void => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(o));
    };
    const p = url.pathname;
    if (p === '/')
      return html(layout('Start', '<h1>Witamy</h1><p>Zobacz <a href="/oferty">oferty</a>.</p>'));
    if (p === '/oferty')
      return html(
        url.searchParams.get('page') === '2'
          ? listing('Oferty, strona 2', [5, 6])
          : listing('Oferty', [1, 2, 3]),
      );
    if (p === '/oferty/laptopy') return html(listing('Laptopy', [2, 3, 4]));
    if (p === '/szukaj') return html(listing(`Wyniki: ${url.searchParams.get('q') ?? ''}`, [1]));
    if (/^\/oferta\/\d+$/.test(p)) return html(item(Number(p.split('/')[2])));
    if (p === '/konto/zaloguj') {
      return html(
        layout(
          'Logowanie',
          '<h1>Zaloguj się</h1><form aria-label="Logowanie" method="post" action="/konto/zaloguj"><input name="email" type="email" required><input name="password" type="password" required><button type="submit">Zaloguj</button></form>',
        ),
      );
    }
    if (p === '/wyloguj') {
      res.statusCode = 302;
      res.setHeader('location', '/');
      return void res.end();
    }
    if (p === '/blocked') return html('<html><body>Forbidden</body></html>', 403);
    if (p === '/api/offers') return json({ items: [{ id: 1, title: 'Laptop', price: 1111.5 }] });
    if (/^\/api\/offers\/\d+$/.test(p))
      return json({
        id: 1,
        title: 'Laptop',
        seller: { email: 'jan.kowalski@example.com', phone: '601 234 567' },
      });
    html('<h1>Nie znaleziono</h1>', 404);
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
