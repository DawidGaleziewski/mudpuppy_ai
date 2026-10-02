import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  driverStep,
  optionsStep,
  purchasePage,
  purchaseTotal,
  resultPage,
  vehicleStep,
  type PageResult,
  type Params,
} from './pages/calculator.js';
import {
  compareResult,
  comparePage,
  contactErrors,
  contactPage,
  contactThanks,
  loginPage,
  loginWall,
  travelPage,
  travelResult,
} from './pages/forms.js';
import { car, faq, glossary, home, house, notFound } from './pages/static.js';

export const ROBOTS_TXT = 'User-agent: *\nDisallow: /__admin/\n';

export interface LoggedRequest {
  method: string;
  path: string;
  query: string;
}

/** Everything a POST can change. Reset on every start and by `resetState()`. */
export interface PortalState {
  purchases: { number: string; total: string }[];
  contactRequests: { topic: string }[];
}

export interface ReferencePortal {
  url: string;
  /** Every request received, in order (tests assert e.g. that no POST reached the portal). */
  requests: LoggedRequest[];
  state: PortalState;
  resetState(): void;
  close(): Promise<void>;
}

export interface StartOptions {
  /** Interface to bind; required so the caller decides what is exposed. */
  host: string;
  /** 0 picks a free port. */
  port: number;
}

function freshState(): PortalState {
  return { purchases: [], contactRequests: [] };
}

function params(url: URL): Params {
  const out: Params = {};
  for (const [k, v] of url.searchParams) out[k] = v;
  return out;
}

async function formBody(req: IncomingMessage): Promise<Params> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 64 * 1024) break;
    chunks.push(c as Buffer);
  }
  const out: Params = {};
  for (const [k, v] of new URLSearchParams(Buffer.concat(chunks).toString('utf8'))) out[k] = v;
  return out;
}

function send(res: ServerResponse, status: number, body: string, type = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function sendPage(res: ServerResponse, r: PageResult) {
  if ('redirect' in r) {
    res.writeHead(303, { location: r.redirect });
    res.end();
  } else send(res, r.status, r.html);
}

type GetHandler = (p: Params) => PageResult | string;

const GET_ROUTES: Record<string, GetHandler> = {
  '/': home,
  '/ubezpieczenia/samochod': car,
  '/ubezpieczenia/dom': house,
  '/ubezpieczenia/podroze': travelPage,
  '/ubezpieczenia/podroze/wynik': travelResult,
  '/porownanie': comparePage,
  '/porownanie/wynik': compareResult,
  '/kalkulator/pojazd': vehicleStep,
  '/kalkulator/kierowca': driverStep,
  '/kalkulator/opcje': optionsStep,
  '/kalkulator/wynik': resultPage,
  '/kontakt': () => contactPage(),
  '/kontakt/dziekujemy': contactThanks,
  '/faq': faq,
  '/slowniczek': glossary,
  '/logowanie': () => loginPage(),
  '/moje-polisy': () => loginWall('Moje polisy'),
  '/moje-polisy/przedluz': () => loginWall('Przedłuż polisę'),
};

export function startReferencePortal(opts: StartOptions): Promise<ReferencePortal> {
  const requests: LoggedRequest[] = [];
  const portal = { state: freshState() } as { state: PortalState };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://portal.invalid');
    const method = req.method ?? 'GET';
    requests.push({ method, path: url.pathname, query: url.search });
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : url.pathname;

    if (method === 'GET' || method === 'HEAD') {
      if (path === '/robots.txt') return send(res, 200, ROBOTS_TXT, 'text/plain; charset=utf-8');
      const handler = GET_ROUTES[path];
      if (!handler) return send(res, 404, notFound());
      const out = handler(params(url));
      return typeof out === 'string' ? send(res, 200, out) : sendPage(res, out);
    }

    if (method === 'POST') {
      const body = await formBody(req);
      if (path === '/kalkulator/zakup') {
        const total = purchaseTotal(body);
        if (total === null) return sendPage(res, { redirect: '/kalkulator/pojazd' });
        const number = `RP/2026/${String(portal.state.purchases.length + 1).padStart(4, '0')}`;
        portal.state.purchases.push({ number, total });
        return send(res, 200, purchasePage(number, total));
      }
      if (path === '/kontakt') {
        const errors = contactErrors(body);
        if (errors.length > 0) return send(res, 200, contactPage(body, errors));
        portal.state.contactRequests.push({ topic: body.temat! });
        return sendPage(res, { redirect: '/kontakt/dziekujemy' });
      }
      if (path === '/logowanie') return send(res, 200, loginPage(true));
      if (path === '/__admin/reset') {
        portal.state = freshState();
        return send(res, 204, '');
      }
      return send(res, 405, notFound());
    }
    return send(res, 405, notFound());
  });

  return new Promise((resolve) => {
    server.listen(opts.port, opts.host, () => {
      const { port } = server.address() as AddressInfo;
      const host = opts.host.includes(':') ? `[${opts.host}]` : opts.host;
      resolve({
        url: `http://${host}:${port}`,
        requests,
        get state() {
          return portal.state;
        },
        resetState() {
          portal.state = freshState();
          requests.length = 0;
        },
        close: () =>
          new Promise<void>((r) => {
            server.closeAllConnections();
            server.close(() => r());
          }),
      });
    });
  });
}
