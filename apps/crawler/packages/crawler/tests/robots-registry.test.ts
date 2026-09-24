import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../src/rate-limiter.js';
import {
  createRobotsRegistry,
  type RobotsFetchRecord,
  type RobotsRegistryOptions,
} from '../src/robots-registry.js';

const UA = 'PathfinderAI-Crawler/0.1 (+mailto:ops@example.com)';
const HOUR = 3_600_000;

type Reply = { status: number; body?: string; location?: string } | Error;

/** A stub `fetch` answering per URL; records every call with its headers and options. */
function stubFetch(routes: Record<string, Reply | (() => Reply)>) {
  const calls: { url: string; ua: string | null; redirect?: string; signal: boolean }[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      ua: new Headers(init?.headers).get('user-agent'),
      redirect: init?.redirect,
      signal: init?.signal instanceof AbortSignal,
    });
    const r = routes[url];
    const reply = typeof r === 'function' ? r() : r;
    if (reply === undefined) throw new TypeError(`fetch failed: no route for ${url}`);
    if (reply instanceof Error) throw reply;
    const headers = new Headers();
    if (reply.location) headers.set('location', reply.location);
    return new Response(reply.body ?? '', { status: reply.status, headers });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function setup(
  routes: Record<string, Reply | (() => Reply)>,
  over: Partial<RobotsRegistryOptions> = {},
) {
  const { fetchImpl, calls } = stubFetch(routes);
  let acquired = 0;
  const base = createRateLimiter({ requestsPerSecond: 100, maxConcurrency: 1 });
  const limiter = {
    ...base,
    get halted() {
      return base.halted;
    },
    get requestsPerSecond() {
      return base.requestsPerSecond;
    },
    acquire: async () => {
      acquired++;
      return base.acquire();
    },
    slowTo: (rps: number) => base.slowTo(rps),
  };
  let t = 0;
  const persisted: RobotsFetchRecord[] = [];
  const changes: string[] = [];
  const reg = createRobotsRegistry({
    allowedDomains: ['example.pl'],
    userAgent: UA,
    limiter,
    fetch: fetchImpl,
    now: () => t,
    persist: async (rec) => {
      persisted.push(rec);
      return { policyId: `p${persisted.length}`, evidenceRef: `${'a'.repeat(64)}.json` };
    },
    onRulesChanged: (host) => void changes.push(host),
    ...over,
  });
  return {
    reg,
    calls,
    persisted,
    changes,
    limiter,
    acquired: () => acquired,
    advance: (ms: number) => void (t += ms),
  };
}

const ROBOTS = 'https://www.example.pl/robots.txt';

describe('robots registry: fetching (contracts/robots.md)', () => {
  it('fetches through the limiter with the User-Agent, manual redirects and a timeout', async () => {
    const s = setup({ [ROBOTS]: { status: 200, body: 'User-agent: *\nDisallow: /x\n' } });
    const p = (await s.reg.ensure('https://www.example.pl/page'))!;
    expect(p.outcome).toBe('rules');
    expect(s.calls).toEqual([{ url: ROBOTS, ua: UA, redirect: 'manual', signal: true }]);
    expect(s.acquired()).toBe(1);
  });

  it('2xx → rules; the policy refuses and allows with the robots: rule', async () => {
    const s = setup({ [ROBOTS]: { status: 200, body: 'User-agent: *\nDisallow: *cHash*\n' } });
    expect(s.reg.check('https://www.example.pl/a?cHash=1')).toEqual({ state: 'unknown' });
    await s.reg.ensure('https://www.example.pl/');
    expect(s.reg.check('https://www.example.pl/a?cHash=1')).toEqual({
      state: 'refused',
      rule: 'robots:Disallow: *cHash*',
      policyId: 'p1',
    });
    expect(s.reg.check('https://www.example.pl/a')).toEqual({ state: 'allowed', rule: null });
  });

  it.each([404, 401, 403, 410, 429])('%i → no_rules (not a block)', async (status) => {
    const s = setup({ [ROBOTS]: { status, body: '<html>blocked</html>' } });
    const p = (await s.reg.ensure('https://www.example.pl/'))!;
    expect(p.outcome).toBe('no_rules');
    expect(s.reg.check('https://www.example.pl/anything')).toEqual({
      state: 'allowed',
      rule: null,
    });
    expect(s.limiter.halted).toBe(false);
  });

  it.each<[string, Reply]>([
    ['5xx', { status: 503 }],
    ['network error', new TypeError('fetch failed')],
    [
      'timeout',
      Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      }),
    ],
  ])('%s → unreachable, every URL on the host refused', async (_name, reply) => {
    const s = setup({ [ROBOTS]: reply });
    const p = (await s.reg.ensure('https://www.example.pl/'))!;
    expect(p.outcome).toBe('unreachable');
    expect(p.failure).toBeTruthy();
    expect(s.reg.check('https://www.example.pl/')).toMatchObject({
      state: 'refused',
      rule: 'robots:unreachable',
    });
  });

  it('follows up to 5 redirects, each rate-limited; the file applies to the original host', async () => {
    const hops: Record<string, Reply> = {};
    for (let i = 0; i < 5; i++)
      hops[i === 0 ? ROBOTS : `https://cdn.other.pl/r${i}`] = {
        status: 301,
        location: `https://cdn.other.pl/r${i + 1}`,
      };
    hops['https://cdn.other.pl/r5'] = { status: 200, body: 'User-agent: *\nDisallow: /x\n' };
    const s = setup(hops);
    const p = (await s.reg.ensure('https://www.example.pl/'))!;
    expect(p.outcome).toBe('rules');
    expect(s.acquired()).toBe(6);
    expect(s.persisted[0]!.redirects).toHaveLength(5);
    expect(s.persisted[0]!.final_url).toBe('https://cdn.other.pl/r5');
    expect(s.reg.check('https://www.example.pl/x').state).toBe('refused');
  });

  it('more than 5 redirects → unreachable', async () => {
    const hops: Record<string, Reply> = { [ROBOTS]: { status: 302, location: '/r1' } };
    for (let i = 1; i <= 6; i++)
      hops[`https://www.example.pl/r${i}`] = { status: 302, location: `/r${i + 1}` };
    const s = setup(hops);
    const p = (await s.reg.ensure('https://www.example.pl/'))!;
    expect(p.outcome).toBe('unreachable');
    expect(p.failure).toContain('redirect');
  });

  it('never fetches hosts outside allowed_domains and reports them as not checked', async () => {
    const s = setup({});
    expect(s.reg.inScope('https://cdn.fonts.com/x.woff')).toBe(false);
    expect(s.reg.check('https://cdn.fonts.com/x.woff')).toEqual({ state: 'not_checked' });
    await expect(s.reg.ensure('https://cdn.fonts.com/x.woff')).resolves.toBeNull();
    expect(s.calls).toEqual([]);
  });

  it('fetches each in-scope host once, also under concurrent ensure calls', async () => {
    const s = setup({
      [ROBOTS]: { status: 200, body: '' },
      'https://m.example.pl/robots.txt': { status: 404 },
    });
    await Promise.all([
      s.reg.ensure('https://www.example.pl/a'),
      s.reg.ensure('https://www.example.pl/b'),
      s.reg.ensure('https://m.example.pl/c'),
    ]);
    expect(s.calls.map((c) => c.url).sort()).toEqual(['https://m.example.pl/robots.txt', ROBOTS]);
    expect(
      s.reg
        .policies()
        .map((p) => p.host)
        .sort(),
    ).toEqual(['m.example.pl', 'www.example.pl']);
  });

  it('re-fetches after 24 h and on refresh; a changed body is reported', async () => {
    let body = 'User-agent: *\nDisallow: /a\n';
    const s = setup({ [ROBOTS]: () => ({ status: 200, body }) });
    await s.reg.ensure('https://www.example.pl/');
    s.advance(23 * HOUR);
    await s.reg.ensure('https://www.example.pl/');
    expect(s.calls).toHaveLength(1);
    s.advance(2 * HOUR);
    await s.reg.ensure('https://www.example.pl/');
    expect(s.calls).toHaveLength(2);
    expect(s.changes).toEqual([]);
    body = 'User-agent: *\nDisallow: /b\n';
    await s.reg.refresh('www.example.pl');
    expect(s.calls).toHaveLength(3);
    expect(s.changes).toEqual(['www.example.pl']);
    expect(s.reg.check('https://www.example.pl/b').state).toBe('refused');
    expect(s.reg.check('https://www.example.pl/a').state).toBe('allowed');
  });

  it('Crawl-delay slower than the rate lowers the limiter; faster never raises it', async () => {
    const slow = setup({ [ROBOTS]: { status: 200, body: 'User-agent: *\nCrawl-delay: 4\n' } });
    await slow.reg.ensure('https://www.example.pl/');
    expect(slow.limiter.requestsPerSecond).toBe(0.25);
    const fast = setup({ [ROBOTS]: { status: 200, body: 'User-agent: *\nCrawl-delay: 0.001\n' } });
    await fast.reg.ensure('https://www.example.pl/');
    expect(fast.limiter.requestsPerSecond).toBe(100);
  });

  it('persists one evidence record per fetch, also for 404 and failures', async () => {
    const s = setup({
      [ROBOTS]: {
        status: 200,
        body: 'User-agent: *\nDisallow: /x\nSitemap: https://www.example.pl/s.xml\n',
      },
      'https://a.example.pl/robots.txt': { status: 404 },
      'https://b.example.pl/robots.txt': { status: 500 },
    });
    await s.reg.ensure('https://www.example.pl/');
    await s.reg.ensure('https://a.example.pl/');
    await s.reg.ensure('https://b.example.pl/');
    expect(s.persisted.map((r) => [r.host, r.outcome, r.http_status])).toEqual([
      ['www.example.pl', 'rules', 200],
      ['a.example.pl', 'no_rules', 404],
      ['b.example.pl', 'unreachable', 500],
    ]);
    const rec = s.persisted[0]!;
    expect(rec).toMatchObject({
      source_url: ROBOTS,
      final_url: ROBOTS,
      redirects: [],
      product_token: 'PathfinderAI-Crawler',
      group_used: '*',
      sitemaps: ['https://www.example.pl/s.xml'],
      truncated: false,
      ignored_lines: 0,
    });
    expect(rec.body).toContain('Disallow: /x');
    expect(rec.content_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof rec.fetched_at).toBe('string');
    expect(s.persisted[2]!.body).toBeNull();
  });

  it('reads at most maxBytes of the body and flags the truncation', async () => {
    const big = 'User-agent: *\nDisallow: /early\n' + '#'.repeat(2000) + '\nDisallow: /late\n';
    const s = setup({ [ROBOTS]: { status: 200, body: big } }, { maxBytes: 1000 });
    await s.reg.ensure('https://www.example.pl/');
    expect(s.persisted[0]!.truncated).toBe(true);
    expect(s.reg.check('https://www.example.pl/early').state).toBe('refused');
    expect(s.reg.check('https://www.example.pl/late').state).toBe('allowed');
  });
});
