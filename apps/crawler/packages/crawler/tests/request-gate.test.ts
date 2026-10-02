import { describe, expect, it, vi } from 'vitest';
import { createRateLimiter, type AcquireOptions } from '../src/rate-limiter.js';
import type { Refusal } from '@pathfinder/safety';
import {
  createRequestGate,
  type RequestDecision,
  type RequestGateOptions,
  type RobotsPageNote,
  type StopEvent,
} from '../src/request-gate.js';
import type { RobotsCheck } from '../src/robots-registry.js';

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
  request?(): unknown;
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
    raw: (r: FakeResponse) => responseHandler(r),
    respond: (
      status: number,
      body = '',
      ct = 'text/html',
      from: { resourceType?: string; mainFrame?: boolean } = {},
    ) =>
      responseHandler({
        headers: () => ({ 'content-type': ct }),
        status: () => status,
        url: () => 'https://x.pl/',
        text: async () => body,
        request: () => ({
          resourceType: () => from.resourceType ?? 'document',
          frame: () => ({ parentFrame: () => (from.mainFrame === false ? {} : null) }),
        }),
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

  it('does not read a vendor script or iframe body as a CAPTCHA page', async () => {
    const { gate, stops } = make();
    const f = fakeContext();
    await gate.install(f.ctx as never);
    const body = 'var a="g-recaptcha";';
    const res = (resourceType: string, parent: unknown) =>
      f.raw({
        headers: () => ({ 'content-type': 'text/javascript' }),
        status: () => 200,
        url: () => 'https://www.gstatic.com/recaptcha/releases/x/recaptcha__pl.js',
        text: async () => body,
        request: () => ({
          resourceType: () => resourceType,
          frame: () => ({ parentFrame: () => parent }),
        }),
      });
    await res('script', null);
    await res('document', {});
    expect(stops).toHaveLength(0);
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

  it('ignores CAPTCHA markers inside vendor scripts and third-party iframes', async () => {
    const { gate, stops } = make();
    const f = fakeContext();
    await gate.install(f.ctx as never);
    // Google's recaptcha__pl.js bundle contains "g-recaptcha" on a normal page with invisible v3.
    await f.respond(200, 'var c="g-recaptcha";', 'text/javascript', { resourceType: 'script' });
    await f.respond(200, '<div class="g-recaptcha">', 'text/html', { mainFrame: false });
    expect(stops).toHaveLength(0);
    await f.respond(403, '', 'text/javascript', { resourceType: 'script' });
    expect(stops[0]!.kind).toBe('http_403');
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

describe('request gate: robots (FR-003, FR-009)', () => {
  type Reply = { status: number; location?: string };
  const UA = 'PathfinderAI-Crawler/0.1 (+me@corp.pl)';

  /** Registry stub: `*cHash*`, `/quote/` and `/api/` disallowed on in-scope hosts (x.pl). */
  function registry() {
    const ensured: string[] = [];
    let loaded = false;
    return {
      ensured,
      reg: {
        inScope: (url: string) => new URL(url).hostname.endsWith('x.pl'),
        ensure: async (url: string) => {
          ensured.push(url);
          loaded = true;
          return null;
        },
        check: (url: string): RobotsCheck => {
          if (!new URL(url).hostname.endsWith('x.pl')) return { state: 'not_checked' };
          if (!loaded) return { state: 'unknown' };
          for (const [needle, rule] of [
            ['cHash', 'robots:Disallow: *cHash*'],
            ['/quote/', 'robots:Disallow: /quote/'],
            ['/api/', 'robots:Disallow: /api/'],
          ] as const)
            if (url.includes(needle)) return { state: 'refused', rule, policyId: 'p1' };
          return { state: 'allowed', rule: null };
        },
      },
    };
  }

  function ctxWith(replies: Record<string, Reply> = {}) {
    let handler!: (route: unknown, request: unknown) => Promise<void>;
    const fetched: string[] = [];
    return {
      fetched,
      ctx: {
        route: async (_p: string, h: typeof handler) => void (handler = h),
        on: () => {},
      },
      async request(url: string, kind: 'main' | 'sub' | 'resource') {
        const route = {
          continue: vi.fn(async () => {}),
          abort: vi.fn(async () => {}),
          fulfill: vi.fn(async () => {}),
          fetch: vi.fn(async (o: { maxRedirects?: number }) => {
            expect(o.maxRedirects).toBe(0);
            fetched.push(url);
            const r = replies[url] ?? { status: 200 };
            return {
              status: () => r.status,
              url: () => url,
              headers: () => (r.location ? { location: r.location } : {}),
            };
          }),
        };
        await handler(route, {
          headers: () => ({ accept: '*/*' }),
          isNavigationRequest: () => kind !== 'resource',
          frame: () => ({ parentFrame: () => (kind === 'sub' ? {} : null) }),
          url: () => url,
        });
        return route;
      },
    };
  }

  function make(
    pageRequests: 'block' | 'allow_and_record' = 'block',
    replies?: Record<string, Reply>,
  ) {
    const r = registry();
    const refused: { url: string; refusal: Refusal }[] = [];
    const notes: RobotsPageNote[] = [];
    const gate = createRequestGate({
      limiter: createRateLimiter({ requestsPerSecond: 1000, maxConcurrency: 1 }),
      userAgent: UA,
      onStop: () => {},
      onNavigationRefused: (url, refusal) => refused.push({ url, refusal }),
      robots: {
        registry: r.reg,
        pageRequests,
        templateFor: (u) => new URL(u).pathname.replace(/\d+/g, ':id'),
        onNote: (n) => notes.push(n),
      },
    });
    const c = ctxWith(replies);
    return { gate, c, refused, notes, ensured: r.ensured };
  }

  it('awaits the host policy before letting any in-scope request through', async () => {
    const m = make();
    await m.gate.install(m.c.ctx as never);
    await m.c.request('https://www.x.pl/logo.png', 'resource');
    expect(m.ensured).toEqual(['https://www.x.pl/logo.png']);
    await m.c.request('https://cdn.fonts.com/a.woff', 'resource');
    expect(m.ensured).toHaveLength(1); // off-domain hosts are not robots-checked
  });

  it('lets only a main-frame navigation jump the rate limiter queue', async () => {
    const base = createRateLimiter({ requestsPerSecond: 1000, maxConcurrency: 1 });
    const priorities: (boolean | undefined)[] = [];
    const r = registry();
    const gate = createRequestGate({
      limiter: {
        ...base,
        acquire: (o?: AcquireOptions) => (priorities.push(o?.priority), base.acquire(o)),
      },
      userAgent: UA,
      onStop: () => {},
      robots: { registry: r.reg, pageRequests: 'block', templateFor: (u) => u, onNote: () => {} },
    });
    const c = ctxWith();
    await gate.install(c.ctx as never);
    await c.request('https://www.x.pl/', 'main');
    await c.request('https://www.x.pl/frame', 'sub');
    await c.request('https://www.x.pl/app.js', 'resource');
    expect(priorities).toEqual([true, false, false]);
  });

  it('aborts a disallowed main-frame navigation with a robots refusal', async () => {
    const m = make();
    await m.gate.install(m.c.ctx as never);
    const r = await m.c.request('https://www.x.pl/a?cHash=1', 'main');
    expect(r.abort).toHaveBeenCalled();
    expect(r.fulfill).not.toHaveBeenCalled();
    expect(m.c.fetched).toEqual([]);
    expect(m.refused).toEqual([
      {
        url: 'https://www.x.pl/a?cHash=1',
        refusal: expect.objectContaining({
          status: 'robots_disallowed',
          rule: 'robots:Disallow: *cHash*',
          policyId: 'p1',
          via: 'request_gate',
        }),
      },
    ]);
    expect(m.gate.robotsStats().refusedNavigations).toBe(1);
  });

  it('fetches allowed navigations without following redirects and fulfills them', async () => {
    const m = make();
    await m.gate.install(m.c.ctx as never);
    const r = await m.c.request('https://www.x.pl/oferty', 'main');
    expect(r.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRedirects: 0,
        headers: expect.objectContaining({ 'user-agent': UA }),
      }),
    );
    expect(r.fulfill).toHaveBeenCalled();
    expect(r.abort).not.toHaveBeenCalled();
  });

  it('refuses a redirect to a disallowed URL before it is followed', async () => {
    const m = make('block', { 'https://www.x.pl/go': { status: 302, location: '/quote/summary' } });
    await m.gate.install(m.c.ctx as never);
    const r = await m.c.request('https://www.x.pl/go', 'main');
    expect(r.abort).toHaveBeenCalled();
    expect(r.fulfill).not.toHaveBeenCalled();
    expect(m.refused[0]).toMatchObject({
      url: 'https://www.x.pl/quote/summary',
      refusal: {
        status: 'robots_disallowed',
        rule: 'robots:Disallow: /quote/',
        via: 'request_gate',
      },
    });
    const ok = make('block', { 'https://www.x.pl/go': { status: 301, location: '/oferty/1' } });
    await ok.gate.install(ok.c.ctx as never);
    expect((await ok.c.request('https://www.x.pl/go', 'main')).fulfill).toHaveBeenCalled();
  });

  it('block: aborts the page own disallowed requests and notes each (template, rule) once', async () => {
    const m = make('block');
    await m.gate.install(m.c.ctx as never);
    const a = await m.c.request('https://www.x.pl/api/items/1', 'resource');
    const b = await m.c.request('https://www.x.pl/api/items/2', 'resource');
    const sub = await m.c.request('https://www.x.pl/quote/frame', 'sub');
    expect(a.abort).toHaveBeenCalled();
    expect(b.abort).toHaveBeenCalled();
    expect(sub.abort).toHaveBeenCalled();
    expect(m.notes).toEqual([
      {
        url: 'https://www.x.pl/api/items/1',
        template: '/api/items/:id',
        rule: 'robots:Disallow: /api/',
        action: 'blocked',
      },
      {
        url: 'https://www.x.pl/quote/frame',
        template: '/quote/frame',
        rule: 'robots:Disallow: /quote/',
        action: 'blocked',
      },
    ]);
    expect(m.gate.robotsStats()).toMatchObject({
      pageRequestsBlocked: 3,
      pageRequestsAllowed: 0,
      notes: [
        { template: '/api/items/:id', rule: 'robots:Disallow: /api/', action: 'blocked', count: 2 },
        { template: '/quote/frame', rule: 'robots:Disallow: /quote/', action: 'blocked', count: 1 },
      ],
    });
    expect(m.refused).toEqual([]);
  });

  it('allow_and_record: lets the page own requests through, still noted; navigations stay refused', async () => {
    const m = make('allow_and_record');
    await m.gate.install(m.c.ctx as never);
    const a = await m.c.request('https://www.x.pl/api/items/1', 'resource');
    expect(a.continue).toHaveBeenCalled();
    expect(m.notes[0]).toMatchObject({ action: 'allowed', rule: 'robots:Disallow: /api/' });
    expect(m.gate.robotsStats().pageRequestsAllowed).toBe(1);
    const nav = await m.c.request('https://www.x.pl/api/page', 'main');
    expect(nav.abort).toHaveBeenCalled();
  });
});

describe('request gate: trace callbacks', () => {
  type Reply = { status: number; location?: string };
  const robotsReg = {
    inScope: (url: string) => new URL(url).hostname.endsWith('x.pl'),
    ensure: async () => null,
    check: (url: string): RobotsCheck =>
      url.includes('/api/')
        ? { state: 'refused', rule: 'robots:Disallow: /api/', policyId: 'p1' }
        : { state: 'allowed', rule: null },
  };

  function setup(over: Partial<RequestGateOptions> = {}, replies: Record<string, Reply> = {}) {
    const decisions: RequestDecision[] = [];
    const checks: { url: string; rule: string; action: string }[] = [];
    const responses: { url: string; status: number; resourceType: string }[] = [];
    const verdicts: { kind: string; status: number; url: string }[] = [];
    let t = 0;
    const limiter = createRateLimiter({ requestsPerSecond: 1000, maxConcurrency: 4 });
    const gate = createRequestGate({
      limiter,
      userAgent: 'UA',
      onStop: () => {},
      now: () => (t += 7),
      onRequestDecision: (d) => decisions.push(d),
      onRobotsCheck: (c) => checks.push(c),
      onResponse: (r) => responses.push(r),
      onBlockVerdict: (v) => verdicts.push(v),
      ...over,
    });
    let routeHandler!: (route: unknown, request: unknown) => Promise<void>;
    let responseHandler!: (r: unknown) => Promise<void>;
    const ctx = {
      route: async (_p: string, h: typeof routeHandler) => void (routeHandler = h),
      on: (_e: string, h: typeof responseHandler) => void (responseHandler = h),
    };
    const request = async (url: string, kind: 'main' | 'resource', method = 'GET') => {
      const route = {
        continue: vi.fn(async () => {}),
        abort: vi.fn(async () => {}),
        fulfill: vi.fn(async () => {}),
        fetch: vi.fn(async () => {
          const r = replies[url] ?? { status: 200 };
          return {
            status: () => r.status,
            headers: () => (r.location ? { location: r.location } : {}),
          };
        }),
      };
      await routeHandler(route, {
        headers: () => ({}),
        isNavigationRequest: () => kind === 'main',
        frame: () => ({ parentFrame: () => null }),
        url: () => url,
        method: () => method,
        resourceType: () => (kind === 'main' ? 'document' : 'xhr'),
      });
      return route;
    };
    const respond = (url: string, status: number, body = '') =>
      responseHandler({
        url: () => url,
        status: () => status,
        headers: () => ({ 'content-type': 'text/html' }),
        text: async () => body,
        request: () => ({ resourceType: () => 'document' }),
      });
    return { gate, ctx, request, respond, decisions, checks, responses, verdicts, limiter };
  }

  it('reports a continued request with method, type, frame and limiter wait', async () => {
    const s = setup();
    await s.gate.install(s.ctx as never);
    await s.request('https://cdn.test/a.js', 'resource', 'POST');
    expect(s.decisions).toEqual([
      {
        url: 'https://cdn.test/a.js',
        method: 'POST',
        resourceType: 'xhr',
        mainFrame: false,
        decision: 'continue',
        limiterWaitMs: 7,
      },
    ]);
  });

  it('reports a navigation-policy refusal with its rule', async () => {
    const s = setup({
      navigationPolicy: (u) =>
        u.includes('/wyloguj') ? { status: 'denylisted', rule: 'logout', reason: 'no' } : null,
    });
    await s.gate.install(s.ctx as never);
    await s.request('https://x.pl/wyloguj', 'main');
    expect(s.decisions[0]).toMatchObject({
      decision: 'abort',
      reason: 'navigation_policy',
      rule: 'logout',
      mainFrame: true,
      limiterWaitMs: 0,
    });
  });

  it('reports every robots check, not only the first per template', async () => {
    const s = setup({
      robots: { registry: robotsReg, pageRequests: 'block', onNote: () => {} },
    });
    await s.gate.install(s.ctx as never);
    await s.request('https://www.x.pl/api/items/1', 'resource');
    await s.request('https://www.x.pl/api/items/1', 'resource');
    expect(s.checks).toEqual([
      { url: 'https://www.x.pl/api/items/1', rule: 'robots:Disallow: /api/', action: 'blocked' },
      { url: 'https://www.x.pl/api/items/1', rule: 'robots:Disallow: /api/', action: 'blocked' },
    ]);
    expect(s.decisions.map((d) => [d.decision, d.reason, d.rule])).toEqual([
      ['abort', 'robots', 'robots:Disallow: /api/'],
      ['abort', 'robots', 'robots:Disallow: /api/'],
    ]);
    expect(s.gate.robotsStats().notes).toHaveLength(1);
  });

  it('marks an allowed-and-recorded robots request on the continue decision', async () => {
    const s = setup({
      robots: { registry: robotsReg, pageRequests: 'allow_and_record' },
    });
    await s.gate.install(s.ctx as never);
    await s.request('https://www.x.pl/api/items/1', 'resource');
    expect(s.decisions[0]).toMatchObject({
      decision: 'continue',
      robotsRule: 'robots:Disallow: /api/',
    });
  });

  it('reports fulfilled navigations with status and refused redirects with their target', async () => {
    const s = setup(
      { robots: { registry: robotsReg, pageRequests: 'block' } },
      {
        'https://www.x.pl/go': { status: 302, location: '/api/x' },
        'https://www.x.pl/moved': { status: 301, location: '/oferty' },
      },
    );
    await s.gate.install(s.ctx as never);
    await s.request('https://www.x.pl/oferty', 'main');
    await s.request('https://www.x.pl/go', 'main');
    await s.request('https://www.x.pl/moved', 'main');
    expect(s.decisions.map((d) => [d.decision, d.status, d.reason, d.redirectTo])).toEqual([
      ['fulfill', 200, undefined, undefined],
      ['abort', 302, 'redirect_refused', 'https://www.x.pl/api/x'],
      ['fulfill', 301, undefined, 'https://www.x.pl/oferty'],
    ]);
  });

  it('reports requests aborted because the limiter is halted', async () => {
    const s = setup();
    await s.gate.install(s.ctx as never);
    s.limiter.halt();
    const r = await s.request('https://cdn.test/a.js', 'resource');
    expect(r.abort).toHaveBeenCalled();
    expect(s.decisions[0]).toMatchObject({ decision: 'abort', reason: 'limiter_halted' });
  });

  it('reports responses and block verdicts', async () => {
    const s = setup();
    await s.gate.install(s.ctx as never);
    await s.respond('https://x.pl/', 200, '<h1>ok</h1>');
    await s.respond('https://x.pl/', 403);
    expect(s.responses).toEqual([
      { url: 'https://x.pl/', status: 200, resourceType: 'document' },
      { url: 'https://x.pl/', status: 403, resourceType: 'document' },
    ]);
    expect(s.verdicts).toEqual([
      { kind: 'http_403', status: 403, url: 'https://x.pl/', warning: expect.any(String) },
    ]);
  });

  it('never lets a throwing callback change what the gate does', async () => {
    const s = setup({
      onRequestDecision: () => {
        throw new Error('trace broke');
      },
    });
    await s.gate.install(s.ctx as never);
    const r = await s.request('https://cdn.test/a.js', 'resource');
    expect(r.continue).toHaveBeenCalled();
  });
});
