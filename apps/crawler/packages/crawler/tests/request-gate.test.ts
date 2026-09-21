import { describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from '../src/rate-limiter.js';
import { createRequestGate, type StopEvent } from '../src/request-gate.js';

interface FakeRoute {
  continue: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
}
interface FakeRequest {
  headers(): Record<string, string>;
  isNavigationRequest(): boolean;
  frame(): { parentFrame(): unknown };
  url(): string;
}
interface FakeResponse {
  headers(): Record<string, string>;
  status(): number;
  url(): string;
  text(): Promise<string>;
}
type RouteHandler = (route: FakeRoute, request: FakeRequest) => Promise<void>;
function fakeContext() {
  let routeHandler!: RouteHandler;
  let responseHandler!: (r: FakeResponse) => Promise<void>;
  return {
    ctx: {
      route: async (_p: string, h: RouteHandler) => void (routeHandler = h),
      on: (_e: string, h: (r: FakeResponse) => Promise<void>) => void (responseHandler = h),
    },
    request: async (nav?: { url: string; mainFrame?: boolean }) => {
      const route = { continue: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
      await routeHandler(route, {
        headers: () => ({ accept: '*/*', 'user-agent': 'Chrome' }),
        isNavigationRequest: () => nav !== undefined,
        frame: () => ({ parentFrame: () => (nav?.mainFrame === false ? {} : null) }),
        url: () => nav?.url ?? 'https://x.pl/asset.js',
      });
      return route;
    },
    respond: (status: number, body = '', ct = 'text/html') =>
      responseHandler({
        headers: () => ({ 'content-type': ct }),
        status: () => status,
        url: () => 'https://x.pl/',
        text: async () => body,
      }),
  };
}

describe('request gate', () => {
  const make = () => {
    const stops: StopEvent[] = [];
    const limiter = createRateLimiter({ requestsPerSecond: 1000, maxConcurrency: 4 });
    const gate = createRequestGate({
      limiter,
      userAgent: 'PathfinderAI-Crawler/0.1 (+me@corp.pl)',
      onStop: (e) => stops.push(e),
    });
    return { stops, limiter, gate };
  };

  it('sets the configured User-Agent on every request', async () => {
    const { gate } = make();
    const f = fakeContext();
    await gate.install(f.ctx as never);
    const route = await f.request();
    expect(route.continue).toHaveBeenCalledWith({
      headers: { accept: '*/*', 'user-agent': 'PathfinderAI-Crawler/0.1 (+me@corp.pl)' },
    });
  });

  it('on a block: emits one stop event, halts the limiter and aborts every later request', async () => {
    const { gate, limiter, stops } = make();
    const f = fakeContext();
    await gate.install(f.ctx as never);
    await f.respond(403);
    await f.respond(403);
    expect(stops).toHaveLength(1);
    expect(stops[0]!.kind).toBe('http_403');
    expect(limiter.halted).toBe(true);
    expect(gate.stopped).toEqual(stops[0]);
    const route = await f.request();
    expect(route.continue).not.toHaveBeenCalled();
    expect(route.abort).toHaveBeenCalled();
  });

  it('detects a CAPTCHA page served with 200', async () => {
    const { gate, stops } = make();
    const f = fakeContext();
    await gate.install(f.ctx as never);
    await f.respond(200, '<div class="g-recaptcha"></div>');
    expect(stops[0]!.kind).toBe('captcha');
  });

  it('ignores normal pages and non-text bodies', async () => {
    const { gate, stops } = make();
    const f = fakeContext();
    await gate.install(f.ctx as never);
    await f.respond(200, '<h1>Oferty</h1>');
    await f.respond(404, 'nie ma');
    await f.respond(200, 'g-recaptcha', 'image/png');
    expect(stops).toHaveLength(0);
  });

  it('aborts a main-frame navigation the navigation policy refuses, and reports it', async () => {
    const refused: string[] = [];
    const limiter = createRateLimiter({ requestsPerSecond: 1000, maxConcurrency: 4 });
    const gate = createRequestGate({
      limiter,
      userAgent: 'UA',
      onStop: () => {},
      navigationPolicy: (url) =>
        url.includes('/wyloguj') ? { status: 'denylisted', rule: 'logout', reason: 'nope' } : null,
      onNavigationRefused: (url) => refused.push(url),
    });
    const f = fakeContext();
    await gate.install(f.ctx as never);
    const bad = await f.request({ url: 'https://x.pl/wyloguj' });
    expect(bad.abort).toHaveBeenCalled();
    expect(bad.continue).not.toHaveBeenCalled();
    expect(refused).toEqual(['https://x.pl/wyloguj']);
    const ok = await f.request({ url: 'https://x.pl/oferty' });
    expect(ok.continue).toHaveBeenCalled();
    // subframe navigations and subresources are not subject to the policy
    expect(
      (await f.request({ url: 'https://x.pl/wyloguj', mainFrame: false })).continue,
    ).toHaveBeenCalled();
  });
});
