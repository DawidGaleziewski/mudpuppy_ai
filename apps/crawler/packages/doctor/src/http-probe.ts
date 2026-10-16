// The doctor's one network primitive: a GET with a chosen User-Agent, directly (Node fetch) or
// through an HTTP forward proxy (absolute-form for http, CONNECT for https). It never throws: an
// error comes back with its code so a check can name the cause (TLS, DNS, refused, timeout).

import { request as httpRequest } from 'node:http';
import { connect as tlsConnect } from 'node:tls';
import type { HttpProbe } from './registry.js';

type Result = Awaited<ReturnType<HttpProbe>>;

const errorOf = (e: unknown): Result => {
  const err = e as Error & { code?: string; cause?: { code?: string; message?: string } };
  const code = err.cause?.code ?? err.code;
  return { error: err.cause?.message ?? err.message, ...(code ? { code } : {}) };
};

async function viaFetch(url: string, userAgent: string, timeoutMs: number): Promise<Result> {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': userAgent },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    await r.body?.cancel();
    return { status: r.status };
  } catch (e) {
    return errorOf(e);
  }
}

function viaHttpProxy(target: URL, proxy: URL, userAgent: string, timeoutMs: number) {
  return new Promise<Result>((resolve) => {
    const req = httpRequest({
      host: proxy.hostname,
      port: proxy.port || 80,
      method: 'GET',
      path: target.href,
      headers: { host: target.host, 'user-agent': userAgent },
      timeout: timeoutMs,
    });
    req.on('response', (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0 });
    });
    req.on('timeout', () =>
      req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })),
    );
    req.on('error', (e) => resolve(errorOf(e)));
    req.end();
  });
}

/**
 * A GET through a CONNECT tunnel: TLS inside it for https; plain HTTP for http, which is how the
 * browser's request gate (`route.fetch`) reaches even an http portal through a proxy (spec 030
 * F-13), so a proxy refusing CONNECT breaks the crawl while an absolute-form GET still works.
 */
function viaConnect(target: URL, proxy: URL, userAgent: string, timeoutMs: number) {
  const https = target.protocol === 'https:';
  return new Promise<Result>((resolve) => {
    const req = httpRequest({
      host: proxy.hostname,
      port: proxy.port || 80,
      method: 'CONNECT',
      path: `${target.hostname}:${target.port || (https ? 443 : 80)}`,
      timeout: timeoutMs,
    });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        resolve({ status: res.statusCode ?? 0 });
        return;
      }
      const stream = https ? tlsConnect({ socket, servername: target.hostname }) : socket;
      const get = () =>
        stream.write(
          `GET ${target.pathname}${target.search} HTTP/1.1\r\nHost: ${target.host}\r\nUser-Agent: ${userAgent}\r\nConnection: close\r\n\r\n`,
        );
      stream.on('error', (e) => resolve(errorOf(e)));
      if (https) stream.on('secureConnect', get);
      else get();
      stream.once('data', (chunk: Buffer) => {
        const m = /^HTTP\/1\.[01] (\d{3})/.exec(chunk.toString('latin1'));
        stream.destroy();
        resolve(m ? { status: Number(m[1]) } : { error: 'no HTTP answer through the tunnel' });
      });
    });
    req.on('timeout', () =>
      req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })),
    );
    req.on('error', (e) => resolve(errorOf(e)));
    req.end();
  });
}

export const httpProbe: HttpProbe = (url, opts) => {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  if (!opts.proxy) return viaFetch(url, opts.userAgent, timeoutMs);
  const target = new URL(url);
  const proxy = new URL(opts.proxy);
  return target.protocol === 'https:' || opts.tunnel
    ? viaConnect(target, proxy, opts.userAgent, timeoutMs)
    : viaHttpProxy(target, proxy, opts.userAgent, timeoutMs);
};
