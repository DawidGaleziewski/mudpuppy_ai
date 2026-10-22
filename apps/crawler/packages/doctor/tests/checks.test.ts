import { createServer, request, type Server } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { connect, type AddressInfo } from 'node:net';
import { readTrustedCa, type PortalConfig } from '@mudpuppy/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeCaFixture } from '../../../tests/fixtures/ca-fixture.js';
import {
  CHECKS,
  httpProbe,
  runChecks,
  tlsChainProbe,
  type Check,
  type HttpProbe,
  type TlsChainProbe,
} from '../src/index.js';

const ca = makeCaFixture();
const tlsCaFile = CHECKS.find((c) => c.id === 'tls.ca-file')!;

const portal = (over: Partial<PortalConfig> = {}): PortalConfig =>
  ({
    id: 'p',
    base_url: 'http://portal.test/',
    environment: 'dev',
    robots: 'respect',
    rate_limit: {
      requests_per_second: 2,
      max_concurrency: 2,
      user_agent: 'MudPuppy-Crawler/0.1',
    },
    ...over,
  }) as PortalConfig;

/** The network checks only (no browser, no SQLite, no portal files). */
const NET = CHECKS.filter(
  (c) => !['env.declared', 'toolchain.sqlite', 'browser.launch'].includes(c.id),
);

const run = (http: HttpProbe, p = portal()) =>
  runChecks(NET, { root: '/nowhere', portal: p, environment: 'dev', http }).then((rows) =>
    Object.fromEntries(rows.map((r) => [r.check.id, r.result])),
  );

describe('doctor checks (spec 030 R-63)', () => {
  it('a reachable portal passes and the conditional checks skip', async () => {
    const r = await run(() => Promise.resolve({ status: 200 }));
    expect(r['net.reach']!.status).toBe('ok');
    expect(r['waf.user-agent']!.status).toBe('skip');
    expect(r['net.ip-allowlist']!.status).toBe('skip');
  });

  it('names a WAF that refuses the crawler User-Agent (GC-07)', async () => {
    const r = await run((_u, o) =>
      Promise.resolve({ status: o.userAgent.startsWith('Mozilla') ? 200 : 403 }),
    );
    expect(r['waf.user-agent']).toMatchObject({ status: 'fail' });
    expect(r['waf.user-agent']!.fix).toContain('rate_limit.user_agent');
    expect(r['net.ip-allowlist']!.status).toBe('skip');
  });

  it('names an IP allowlist and points at network.proxy (GC-03, GC-05)', async () => {
    const r = await run(() => Promise.resolve({ status: 403 }));
    expect(r['net.ip-allowlist']).toMatchObject({ status: 'fail' });
    expect(r['net.ip-allowlist']!.fix).toContain('network.proxy');
  });

  it('accepts a proxy that gets through, and warns about robots behind it', async () => {
    const p = portal({
      network: {
        proxy: { server: 'http://proxy.test:3128', bypass: [] },
        ignore_https_errors: false,
      },
    });
    const r = await run((_u, o) => Promise.resolve({ status: o.proxy ? 200 : 403 }), p);
    expect(r['net.proxy']!.status).toBe('ok');
    expect(r['net.ip-allowlist']!.status).toBe('ok');
    expect(r['robots.proxy']).toMatchObject({ status: 'warn' });
  });

  it('fails a proxy that forwards a plain GET but refuses a CONNECT tunnel (spec 030 F-13)', async () => {
    const p = portal({
      network: {
        proxy: { server: 'http://proxy.test:3128', bypass: [] },
        ignore_https_errors: false,
      },
    });
    const statusFor = (o: { proxy?: string; tunnel?: boolean }): number => {
      if (o.tunnel) return 405;
      return o.proxy ? 200 : 403;
    };
    const r = await run((_u, o) => Promise.resolve({ status: statusFor(o) }), p);
    expect(r['net.proxy']).toMatchObject({ status: 'fail' });
    expect(r['net.proxy']!.detail).toContain('CONNECT');
  });
});

describe.skipIf(ca === null)('tls.ca-file (spec 031 US4)', () => {
  const https = (caFile: string) =>
    portal({
      base_url: 'https://portal.test/',
      network: { ignore_https_errors: false, ca_file: caFile },
    });
  const withChain =
    (...spki: string[]): TlsChainProbe =>
    () =>
      Promise.resolve({ chain: spki.map((s, i) => ({ subject: `CN=c${String(i)}`, spki: s })) });
  const check = (p: PortalConfig, tlsChain: TlsChainProbe) =>
    runChecks([tlsCaFile], {
      root: '/nowhere',
      portal: p,
      environment: 'dev',
      http: () => Promise.resolve({ status: 200 }),
      tlsChain,
    }).then((rows) => rows[0]!.result);

  it('passes when the portal presents a certificate of the file', async () => {
    const spki = readTrustedCa(ca!.caFile).spki[0]!;
    const r = await check(https(ca!.caFile), withChain('leaf-key', spki));
    expect(r).toMatchObject({ status: 'ok' });
    expect(r.detail).toContain('Test Corp Issuing CA');
  });

  it('fails, naming the presented chain, when none matches (a root that is never presented)', async () => {
    const r = await check(https(ca!.caFile), withChain('leaf-key', 'other-ca'));
    expect(r.status).toBe('fail');
    expect(r.detail).toContain('CN=c0 ← CN=c1');
    expect(r.fix).toContain('issuing CA');
  });

  it('fails on an unreadable file and skips without a ca_file', async () => {
    expect((await check(https('/nowhere/ca.pem'), withChain())).status).toBe('fail');
    const none = await runChecks([tlsCaFile], {
      root: '/nowhere',
      portal: portal(),
      environment: 'dev',
      http: () => Promise.resolve({ status: 200 }),
    });
    expect(none[0]!.result.status).toBe('skip');
  });

  it('reads the chain a real server presents', async () => {
    const server = createHttpsServer(
      { key: ca!.leafKey, cert: ca!.leafCert + ca!.caPem },
      (_q, s) => s.end(),
    );
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `https://127.0.0.1:${String((server.address() as AddressInfo).port)}/`;
    const r = await tlsChainProbe(url, { timeoutMs: 5000 });
    server.close();
    expect('chain' in r && r.chain.map((c) => c.spki)).toContain(readTrustedCa(ca!.caFile).spki[0]);
  });

  it('names TLS inspection and DNS failures (GC-12)', async () => {
    const tls = await run(() =>
      Promise.resolve({
        error: 'self-signed certificate in certificate chain',
        code: 'SELF_SIGNED_CERT_IN_CHAIN',
      }),
    );
    expect(tls['net.reach']!.fix).toContain('ignore_https_errors');
    const dns = await run(() =>
      Promise.resolve({ error: 'getaddrinfo ENOTFOUND', code: 'ENOTFOUND' }),
    );
    expect(dns['net.reach']!.fix).toContain('network.proxy');
  });

  it('skips a check whose dependency did not pass', async () => {
    const failing: Check = {
      id: 'a',
      title: 'a',
      probe: () => Promise.resolve({ status: 'fail', detail: 'x' }),
    };
    const dependent: Check = {
      id: 'b',
      title: 'b',
      dependsOn: ['a'],
      probe: () => Promise.resolve({ status: 'ok', detail: 'y' }),
    };
    const rows = await runChecks([failing, dependent], {
      root: '/',
      portal: portal(),
      environment: 'dev',
      http: httpProbe,
    });
    expect(rows[1]!.result).toEqual({ status: 'skip', detail: 'needs a first' });
  });
});

describe('httpProbe', () => {
  let site: Server;
  let proxy: Server;
  let siteUrl: string;
  let proxyUrl: string;

  beforeAll(async () => {
    site = createServer((req, res) => {
      res.writeHead(req.headers.via === 'test-proxy' ? 200 : 403);
      res.end();
    });
    proxy = createServer((req, res) => {
      const up = request(req.url!, { headers: { ...req.headers, via: 'test-proxy' } }, (r) => {
        res.writeHead(r.statusCode ?? 502);
        r.pipe(res);
      });
      req.pipe(up);
    });
    await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
    await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
    siteUrl = `http://127.0.0.1:${(site.address() as AddressInfo).port}/`;
    proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    site.close();
    proxy.close();
  });

  it('gets a status directly and through an HTTP proxy, and an error code when nothing answers', async () => {
    expect(await httpProbe(siteUrl, { userAgent: 'x' })).toEqual({ status: 403 });
    expect(await httpProbe(siteUrl, { userAgent: 'x', proxy: proxyUrl })).toEqual({ status: 200 });
    // A port nobody listens on (taken, then released).
    const free = createServer();
    await new Promise<void>((r) => free.listen(0, '127.0.0.1', r));
    const port = (free.address() as AddressInfo).port;
    await new Promise<void>((r) => free.close(() => r()));
    const down = await httpProbe(`http://127.0.0.1:${port}/`, { userAgent: 'x', timeoutMs: 2000 });
    expect(down).toMatchObject({ code: 'ECONNREFUSED' });
  });

  it('tunnels an http target through CONNECT when asked, and reports a proxy that cannot', async () => {
    // The test proxy has no CONNECT handler: Node drops the socket.
    const refused = await httpProbe(siteUrl, {
      userAgent: 'x',
      proxy: proxyUrl,
      tunnel: true,
      timeoutMs: 2000,
    });
    expect(refused).toHaveProperty('error');
    const tunnelling = createServer();
    tunnelling.on('connect', (req, client) => {
      const [host, port] = (req.url ?? '').split(':');
      const up = connect(Number(port), host, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        up.pipe(client);
        client.pipe(up);
      });
    });
    await new Promise<void>((r) => tunnelling.listen(0, '127.0.0.1', r));
    const via = `http://127.0.0.1:${(tunnelling.address() as AddressInfo).port}`;
    // Through the tunnel the site sees no `via` header: 403, but an HTTP answer.
    expect(await httpProbe(siteUrl, { userAgent: 'x', proxy: via, tunnel: true })).toEqual({
      status: 403,
    });
    tunnelling.close();
  });
});
