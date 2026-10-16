// The scar-maker HTTP server (spec 030 FR-001): one listener per loopback host, the same routes on
// both; a scar tells the hosts apart through `ctx.host`.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { esc, html, page, text } from './page.js';
import { startProxy } from './proxy.js';
import { SCARS } from './scars/index.js';
import type { Handler, HostRole, ScarContext } from './types.js';

export const PORTAL_HOST = '127.0.0.1';
export const SECOND_HOST = '127.0.0.2';

export interface ScarMaker {
  portal: string;
  second: string;
  /** The forward proxy of the network scars (spec 030 R-63) on `port + 2`. */
  proxy: string;
  close(): Promise<void>;
}

function routeTable(): Map<string, Handler> {
  const table = new Map<string, Handler>();
  for (const scar of SCARS)
    for (const [path, handler] of Object.entries(scar.routes)) {
      if (table.has(path)) throw new Error(`route ${path} is defined twice (${scar.id})`);
      table.set(path, handler);
    }
  return table;
}

const index: Handler = (_req, res) =>
  html(
    res,
    page(
      'Scar maker',
      `<p>Real-world obstacles, one per page.</p>
<ul>${SCARS.filter((s) => s.inIndex !== false)
        .map((s) => `<li><a href="${s.entry}">${esc(s.id)}</a></li>`)
        .join('\n')}</ul>`,
    ),
  );

const robots = 'User-agent: *\nDisallow: /__admin/\n';

const builtins: Record<string, Handler> = {
  '/': index,
  '/healthz': (_req, res) => text(res, 'ok'),
  '/robots.txt': (_req, res) => text(res, robots),
  '/__admin/reset': (_req, res, ctx) => {
    ctx.memory.clear();
    text(res, 'reset');
  },
};

function cookiesOf(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function bodyOf(req: IncomingMessage): Promise<string> {
  if (req.method !== 'POST' && req.method !== 'PUT') return '';
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });
}

/** Start scar-maker on both hosts at `port`; resolves once both listen. */
export async function startScarMaker(port: number): Promise<ScarMaker> {
  const table = routeTable();
  const memory = new Map<string, unknown>();
  const portal = `http://${PORTAL_HOST}:${port}`;
  const second = `http://${SECOND_HOST}:${port}`;

  const handle = (role: HostRole) => async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', portal);
    const ctx: ScarContext = {
      host: role,
      portal,
      second,
      path: url.pathname,
      query: url.searchParams,
      body: await bodyOf(req),
      cookies: cookiesOf(req),
      memory,
    };
    const handler = builtins[url.pathname] ?? table.get(url.pathname);
    try {
      if (handler) await handler(req, res, ctx);
      else html(res, page('Not found', `<p>${esc(url.pathname)} does not exist.</p>`), 404);
    } catch (e) {
      if (!res.headersSent) text(res, `scar failed: ${(e as Error).message}`, 500);
    }
  };

  // Fire-and-forget: `handle` answers every request itself, a failure included.
  const serve = (role: HostRole) => (req: IncomingMessage, res: ServerResponse) =>
    void handle(role)(req, res);
  const servers = [createServer(serve('portal')), createServer(serve('second'))];
  await listen(servers[0]!, PORTAL_HOST, port);
  await listen(servers[1]!, SECOND_HOST, port);
  const proxy = await startProxy(port + 2, PORTAL_HOST);
  return {
    portal,
    second,
    proxy: `http://${PORTAL_HOST}:${port + 2}`,
    close: () =>
      Promise.all(
        [...servers, proxy].map(
          (s) =>
            new Promise<void>((r) => {
              s.closeAllConnections();
              s.close(() => r());
            }),
        ),
      ).then(() => undefined),
  };
}
