// Checks of the way to the portal (field GC-03/04/05 proxy and allowlist, GC-07 WAF User-Agent,
// GC-12 TLS inspection). Each reports what it saw and the portal-file setting that fixes it.

import type { Check, DoctorContext } from '../registry.js';

/** A User-Agent of a current desktop browser, for the WAF comparison only (never stored). */
const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const TLS_CODES = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/;

const crawlerUa = (ctx: DoctorContext): string =>
  ctx.portal.rate_limit?.user_agent ?? 'PathfinderAI-Crawler/0.1';

const direct = (ctx: DoctorContext) =>
  ctx.facts.get('direct') as { status: number } | { error: string; code?: string } | undefined;

export const netReach: Check = {
  id: 'net.reach',
  title: 'The portal answers a direct request',
  probe: async (ctx) => {
    const r = await ctx.http(ctx.portal.base_url, { userAgent: crawlerUa(ctx) });
    ctx.facts.set('direct', r);
    if ('status' in r)
      return r.status < 400
        ? { status: 'ok', detail: `HTTP ${String(r.status)} from ${ctx.portal.base_url}` }
        : {
            status: 'warn',
            detail: `HTTP ${String(r.status)} before any page (see the checks below)`,
          };
    if (TLS_CODES.test(r.code ?? r.error))
      return {
        status: 'fail',
        detail: `TLS error (${r.code ?? r.error}): a TLS-inspecting proxy re-signs the site's certificate`,
        fix: 'trust the corporate CA (NODE_EXTRA_CA_CERTS for the server, the system store for the browser), or set network.ignore_https_errors: true',
      };
    if (r.code === 'ENOTFOUND')
      return {
        status: 'fail',
        detail: `the host does not resolve (${r.error})`,
        fix: 'the host may resolve only through the corporate proxy: set network.proxy',
      };
    return {
      status: ctx.portal.network?.proxy ? 'warn' : 'fail',
      detail: `no direct answer (${r.code ?? r.error})`,
      fix: 'if the site is reachable only through a corporate proxy, set network.proxy { server, bypass }',
    };
  },
};

export const wafUserAgent: Check = {
  id: 'waf.user-agent',
  title: 'A firewall does not reject the crawler User-Agent',
  appliesWhen: (ctx) => {
    const d = direct(ctx);
    return d !== undefined && 'status' in d && d.status === 403;
  },
  probe: async (ctx) => {
    const r = await ctx.http(ctx.portal.base_url, { userAgent: BROWSER_UA });
    if ('status' in r && r.status < 400)
      return {
        status: 'fail',
        detail: `403 with the crawler User-Agent, HTTP ${String(r.status)} with a browser one: a WAF gates on the User-Agent`,
        fix: 'set rate_limit.user_agent to a browser-like User-Agent the client allows (keep it in the portal file, never in code)',
      };
    return { status: 'ok', detail: 'the User-Agent is not what is refused' };
  },
};

export const netProxy: Check = {
  id: 'net.proxy',
  title: 'The configured proxy forwards to the portal',
  appliesWhen: (ctx) => ctx.portal.network?.proxy !== undefined,
  probe: async (ctx) => {
    const proxy = ctx.portal.network!.proxy!.server;
    const r = await ctx.http(ctx.portal.base_url, { userAgent: crawlerUa(ctx), proxy });
    ctx.facts.set('proxied', r);
    if ('status' in r && r.status < 400)
      return { status: 'ok', detail: `HTTP ${String(r.status)} through ${proxy}` };
    return {
      status: 'fail',
      detail: 'status' in r ? `HTTP ${String(r.status)} through ${proxy}` : `${proxy}: ${r.error}`,
      fix: 'check network.proxy.server (host:port of the corporate proxy; on WSL read it from the Windows PAC file)',
    };
  },
};

export const netAllowlist: Check = {
  id: 'net.ip-allowlist',
  title: 'The portal admits this machine',
  dependsOn: ['net.reach'],
  appliesWhen: (ctx) => {
    const d = direct(ctx);
    return d !== undefined && 'status' in d && d.status === 403;
  },
  probe: (ctx) => {
    const proxied = ctx.facts.get('proxied') as { status: number } | undefined;
    if (proxied && proxied.status < 400)
      return Promise.resolve({
        status: 'ok',
        detail:
          'direct 403, through the proxy fine: the portal admits only the proxy egress (network.proxy is set)',
      });
    if (ctx.results.get('waf.user-agent')?.status === 'fail')
      return Promise.resolve({ status: 'skip', detail: 'the 403 is the User-Agent (above)' });
    return Promise.resolve({
      status: 'fail',
      detail:
        'HTTP 403 before any page with no proxy that helps: an IP allowlist ("not whitelisted")',
      fix: 'route through the allowlisted egress: network.proxy { server: http://<proxy>:<port>, bypass: [<CDN hosts>] }',
    });
  },
};

export const robotsBehindProxy: Check = {
  id: 'robots.proxy',
  title: 'robots.txt can be read the way the server reads it',
  appliesWhen: (ctx) => ctx.portal.network?.proxy !== undefined && ctx.portal.robots !== 'ignore',
  probe: () =>
    Promise.resolve({
      status: 'warn',
      detail: 'the server fetches robots.txt directly, not through the browser proxy',
      fix: "on a proxy-only portal set robots: ignore (the owner's choice for sites they work on)",
    }),
};
