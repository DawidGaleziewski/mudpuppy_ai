import type { ProbeFault } from '@pathfinder/core';
import type { RunState } from '../run-state.js';

type Page = RunState['session']['page'];
type RouteHandler = Parameters<Page['route']>[1];
type Route = Parameters<RouteHandler>[0];
type Request = Parameters<RouteHandler>[1];

/** What the fault did: whether a request was hit, which one, and the status the page was given. */
export interface FaultResult {
  fault: ProbeFault;
  hit: boolean;
  /** Method and path of the request that was broken (no query: it may hold typed values). */
  request: string | null;
  status: number | null;
}

export interface ArmedFault {
  /** Undo the fault after the page was observed; a held request is dropped then. */
  disarm(): Promise<FaultResult>;
}

/**
 * Run `fn` (a press and its observation) with a fault armed and the error page kept (a trace
 * variant's `fault`, spec 032 US3); without a fault it just runs `fn`.
 */
export async function withFault<T>(
  rs: RunState,
  fault: ProbeFault | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (fault === undefined) return fn();
  const armed = await armFault(rs, fault);
  rs.keepErrorPages = true;
  try {
    return await fn();
  } finally {
    rs.keepErrorPages = false;
    await armed.disarm();
  }
}

/** How long `delay` holds a page load (a full-page form post) before letting it through. */
export const DOCUMENT_DELAY_MS = 10_000;

/**
 * The request a step's control sends: a page load, or a script call that writes (not a GET, which
 * is usually a poll or analytics). Static files always pass.
 */
function isStepRequest(r: Request, origin: string): boolean {
  if (!r.url().startsWith(origin)) return false;
  const type = r.resourceType();
  if (type === 'document') return true;
  return (type === 'xhr' || type === 'fetch') && r.method() !== 'GET';
}

/**
 * Break the request the next click sends, in the crawler's own browser only (spec 032 plan decision
 * 8, owner answer O-M1): abort it, answer it with HTTP 500, hold it until the page was observed, or
 * take the browser offline. Nothing malformed reaches the server; an aborted or answered request
 * never leaves the browser. The first matching request is hit; later ones pass to the request gate.
 */
export async function armFault(rs: RunState, fault: ProbeFault): Promise<ArmedFault> {
  const page = rs.session.page;
  const origin = new URL(page.url()).origin;
  const result: FaultResult = { fault, hit: false, request: null, status: null };
  if (fault === 'offline') {
    // Hit only when the step tried to reach the network while it was gone.
    let failed: string | null = null;
    const step = (r: Request): string => `${r.method()} ${new URL(r.url()).pathname}`;
    const onFailed = (r: Request): void => {
      if (failed === null && isStepRequest(r, origin)) failed = step(r);
    };
    // The request gate answers documents through its own route, outside the emulated network, so
    // a page-load submit went through while offline (F-03@036): the step's request fails here as
    // a dropped connection does (spec 037 FR-003).
    const cut = async (route: Route, request: Request): Promise<void> => {
      if (failed !== null || !isStepRequest(request, origin)) return route.fallback();
      failed = step(request);
      return route.abort('internetdisconnected');
    };
    page.on('requestfailed', onFailed);
    await page.route('**/*', cut);
    await rs.session.context.setOffline(true);
    return {
      async disarm() {
        await rs.session.context.setOffline(false);
        await page.unroute('**/*', cut);
        page.off('requestfailed', onFailed);
        return { ...result, hit: failed !== null, request: failed };
      },
    };
  }
  const held: Route[] = [];
  const slowLoads: { route: Route; timer: NodeJS.Timeout }[] = [];
  const letThrough = (route: Route) => void route.continue().catch(() => undefined);
  const handler = async (route: Route, request: Request): Promise<void> => {
    if (result.hit || !isStepRequest(request, origin)) return route.fallback();
    result.hit = true;
    result.request = `${request.method()} ${new URL(request.url()).pathname}`;
    if (fault === 'block_request') return route.abort('failed');
    if (fault === 'http_500') {
      result.status = 500;
      return route.fulfill({
        status: 500,
        contentType: request.resourceType() === 'document' ? 'text/html' : 'application/json',
        body:
          request.resourceType() === 'document'
            ? '<!doctype html><title>500</title><h1>Internal Server Error</h1>'
            : '{"error":"Internal Server Error"}',
      });
    }
    if (request.resourceType() === 'document') {
      // A held page load would never be observed: while it is pending every page read waits for
      // it (spec 032 F-17). It is let through after a slow server's wait instead.
      slowLoads.push({ route, timer: setTimeout(() => letThrough(route), DOCUMENT_DELAY_MS) });
      return;
    }
    held.push(route); // `delay`: the page waits; the observation sees it waiting
  };
  await page.route('**/*', handler);
  return {
    async disarm() {
      // A page load still waiting (the press failed early) goes through now; one already let through
      // refuses a second continue, which is ignored.
      for (const s of slowLoads.splice(0)) {
        clearTimeout(s.timer);
        letThrough(s.route);
      }
      await page.unroute('**/*', handler);
      for (const r of held.splice(0)) await r.abort('timedout').catch(() => undefined);
      return result;
    },
  };
}
