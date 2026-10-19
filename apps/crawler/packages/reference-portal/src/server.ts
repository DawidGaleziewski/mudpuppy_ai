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
import { pln } from './html.js';
import { typicalVehicleValue } from './rules.js';
import { applyScenarios, type ScenarioId } from './scenarios.js';

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
  /** The switchboard scenarios this instance injects. */
  scenarios: readonly ScenarioId[];
  resetState(): void;
  close(): Promise<void>;
}

export interface StartOptions {
  /** Interface to bind; required so the caller decides what is exposed. */
  host: string;
  /** 0 picks a free port. */
  port: number;
  /** Switchboard scenarios to inject (spec 039 design § 19.1); none by default. */
  scenarios?: readonly ScenarioId[];
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

/** The page a response serves and the instance's scenarios (spec 039), set by the handler. */
const pageOf = new WeakMap<ServerResponse, { path: string; scenarios: readonly ScenarioId[] }>();

function send(
  res: ServerResponse,
  status: number,
  body: string,
  type = 'text/html; charset=utf-8',
) {
  const page = pageOf.get(res);
  const out =
    page && type.startsWith('text/html') ? applyScenarios(page.path, body, page.scenarios) : body;
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(out);
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

interface Asset {
  status: number;
  type: string;
  body: (p: Params) => string;
}

/**
 * Files that are not pages: robots.txt and what the pages' scripts fetch: the typical vehicle value (an API of the OC/AC process, step 4b)
 * and two calls unrelated to any process, which an export must leave out as noise (owner review
 * 2026-10-17, point d): an icon sprite every page loads, and an analytics ping.
 */
const ASSETS: Record<string, Asset> = {
  '/robots.txt': { status: 200, type: 'text/plain; charset=utf-8', body: () => ROBOTS_TXT },
  '/api/wartosc-pojazdu': {
    status: 200,
    type: 'application/json; charset=utf-8',
    body: (p) => {
      const value = typicalVehicleValue(p.marka ?? '', Number(p.rok_produkcji));
      return JSON.stringify({ marka: p.marka ?? '', typowa: value, typowa_tekst: pln(value) });
    },
  },
  '/static/ikony.svg': {
    status: 200,
    type: 'image/svg+xml',
    body: () =>
      '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="auto" viewBox="0 0 16 16"><rect width="16" height="8" y="4"/></symbol></svg>',
  },
};
// 200 with a body: Chromium reports a fetch answered 204 as aborted, which the recorder never keeps.
const ANALYTICS: Asset = {
  status: 200,
  type: 'application/json; charset=utf-8',
  body: () => '{"ok":true}',
};

/** The release bundle every page loads (`/static/app.<build>.js`, spec 039): it does nothing. */
const BUNDLE: Asset = {
  status: 200,
  type: 'text/javascript; charset=utf-8',
  body: () => '/* reference portal release bundle */',
};
const BUNDLE_PATH = /^\/static\/app\.[0-9a-f]{8}\.js$/;

const assetFor = (assets: Record<string, Asset>, path: string): Asset | undefined =>
  assets[path] ??
  (path.startsWith('/analytics/') ? ANALYTICS : undefined) ??
  (BUNDLE_PATH.test(path) ? BUNDLE : undefined);

/** The assets of one instance: the shared ones plus the switchboard's admin report. */
const instanceAssets = (scenarios: readonly ScenarioId[]): Record<string, Asset> => ({
  ...ASSETS,
  '/__admin/scenarios': {
    status: 200,
    type: 'application/json; charset=utf-8',
    body: () => JSON.stringify({ scenarios }),
  },
});

export function startReferencePortal(opts: StartOptions): Promise<ReferencePortal> {
  const requests: LoggedRequest[] = [];
  const portal = { state: freshState() };
  const scenarios = [...(opts.scenarios ?? [])];
  const assets = instanceAssets(scenarios);

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://portal.invalid');
    const method = req.method ?? 'GET';
    requests.push({ method, path: url.pathname, query: url.search });
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : url.pathname;
    pageOf.set(res, { path, scenarios });

    if (method === 'GET' || method === 'HEAD') {
      const asset = assetFor(assets, path);
      if (asset) return send(res, asset.status, asset.body(params(url)), asset.type);
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
  };
  // Node ignores the handler's promise: a failed request (e.g. an aborted form body) answers 500
  // instead of becoming an unhandled rejection (G-21).
  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
  });

  return new Promise((resolve) => {
    server.listen(opts.port, opts.host, () => {
      const { port } = server.address() as AddressInfo;
      const host = opts.host.includes(':') ? `[${opts.host}]` : opts.host;
      resolve({
        url: `http://${host}:${port}`,
        requests,
        scenarios,
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
