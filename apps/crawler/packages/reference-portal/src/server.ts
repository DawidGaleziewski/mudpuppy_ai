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
import {
  accountFor,
  cookiesOf,
  policiesPage,
  renewalPage,
  sessionAccount,
  SESSION_COOKIE,
  type Account,
} from './pages/account.js';
import { car, faq, glossary, home, house, notFound } from './pages/static.js';
import { pln } from './html.js';
import { typicalVehicleValue } from './rules.js';
import {
  applyScenarios,
  failsUnder,
  scenarioPage,
  AB_COOKIE,
  SERVER_ERROR_PAGE,
  type ScenarioId,
  type Visit,
} from './scenarios.js';

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

/** The page a response serves, the instance's scenarios (spec 039) and the visit (spec 046). */
const pageOf = new WeakMap<
  ServerResponse,
  { path: string; scenarios: readonly ScenarioId[]; visit: Visit }
>();

/** The customer area by path: the account's page, or the login wall for a guest (spec 046). */
function accountPage(path: string, account: Account | undefined): string | null {
  if (path === '/moje-polisy') return account ? policiesPage(account) : loginWall('Moje polisy');
  if (path === '/moje-polisy/przedluz')
    return account ? renewalPage(account) : loginWall('Przedłuż polisę');
  return null;
}

function send(
  res: ServerResponse,
  status: number,
  body: string,
  type = 'text/html; charset=utf-8',
) {
  const page = pageOf.get(res);
  const out =
    page && type.startsWith('text/html')
      ? applyScenarios(page.path, body, page.scenarios, page.visit)
      : body;
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

/**
 * Scenario ab-test: the arm of a session, given in turn (A, B, A, …) to a page request without
 * one. The counter belongs to one instance.
 */
function abArmPicker(scenarios: readonly ScenarioId[]) {
  let nextArm = 0;
  return (res: ServerResponse, path: string, cookies: Record<string, string>) => {
    if (!scenarios.includes('ab-test')) return null;
    const had = cookies[AB_COOKIE];
    if (had === 'A' || had === 'B') return had;
    if (!(path in GET_ROUTES) && accountPage(path, undefined) === null) return null; // assets, robots
    const arm = nextArm++ % 2 === 0 ? 'A' : 'B';
    res.setHeader('set-cookie', `${AB_COOKIE}=${arm}; Path=/`);
    return arm;
  };
}

/** A login form post: the session cookie and the customer area, or the form again (spec 046). */
function logIn(res: ServerResponse, body: Params): void {
  const who = accountFor(body.login ?? '', body.haslo ?? '');
  if (!who) return send(res, 200, loginPage(true));
  res.setHeader('set-cookie', `${SESSION_COOKIE}=${who.login}; Path=/; HttpOnly`);
  return sendPage(res, { redirect: '/moje-polisy' });
}

/** A form post: the purchase, the contact form, the login, or the admin reset. */
function handlePost(
  portal: { state: PortalState },
  res: ServerResponse,
  path: string,
  body: Params,
): void {
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
  if (path === '/logowanie') return logIn(res, body);
  if (path === '/__admin/reset') {
    portal.state = freshState();
    return send(res, 204, '');
  }
  return send(res, 405, notFound());
}

export function startReferencePortal(opts: StartOptions): Promise<ReferencePortal> {
  const requests: LoggedRequest[] = [];
  const portal = { state: freshState() };
  const scenarios = [...(opts.scenarios ?? [])];
  const assets = instanceAssets(scenarios);

  /** Earlier GETs of this very address (path and query) on this instance (flaky-page, spec 040). */
  const loadsBefore = (path: string, p: Params): number => {
    const query = new URLSearchParams(p as Record<string, string>).toString();
    const same = (r: LoggedRequest) =>
      r.method === 'GET' &&
      (r.path.length > 1 ? r.path.replace(/\/$/, '') : r.path) === path &&
      new URLSearchParams(r.query).toString() === query;
    return requests.filter(same).length - 1; // this request is already logged
  };

  const abArmOf = abArmPicker(scenarios);

  /** An asset, a page, or the error a scenario injects for this request. */
  const serveGet = (res: ServerResponse, path: string, p: Params, account?: Account): void => {
    const asset = assetFor(assets, path);
    if (asset) return send(res, asset.status, asset.body(p), asset.type);
    const extra = scenarioPage(path, p, scenarios);
    if (extra !== null) return send(res, 200, extra);
    const area = accountPage(path, account);
    if (area !== null) return send(res, 200, area);
    const handler = GET_ROUTES[path];
    if (!handler) return send(res, 404, notFound());
    if (failsUnder(path, p, scenarios, loadsBefore(path, p)))
      return send(res, 500, SERVER_ERROR_PAGE);
    const out = handler(p);
    return typeof out === 'string' ? send(res, 200, out) : sendPage(res, out);
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://portal.invalid');
    const method = req.method ?? 'GET';
    requests.push({ method, path: url.pathname, query: url.search });
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : url.pathname;
    const cookies = cookiesOf(req.headers.cookie);
    const account = sessionAccount(cookies);
    const visit: Visit = {
      segment: account?.segment ?? null,
      abArm: method === 'GET' ? abArmOf(res, path, cookies) : null,
    };
    pageOf.set(res, { path, scenarios, visit });

    if (method === 'GET' || method === 'HEAD') return serveGet(res, path, params(url), account);

    if (method === 'POST') return handlePost(portal, res, path, await formBody(req));
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
