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

function viaConnect(target: URL, proxy: URL, userAgent: string, timeoutMs: number) {
  return new Promise<Result>((resolve) => {
    const req = httpRequest({
      host: proxy.hostname,
      port: proxy.port || 80,
      method: 'CONNECT',
      path: `${target.hostname}:${target.port || 443}`,
      timeout: timeoutMs,
    });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        resolve({ status: res.statusCode ?? 0 });
        return;
      }
      const tls = tlsConnect({ socket, servername: target.hostname });
      tls.on('error', (e) => resolve(errorOf(e)));
      tls.on('secureConnect', () => {
        tls.write(
          `GET ${target.pathname}${target.search} HTTP/1.1\r\nHost: ${target.host}\r\nUser-Agent: ${userAgent}\r\nConnection: close\r\n\r\n`,
        );
      });
      tls.once('data', (chunk: Buffer) => {
        const m = /^HTTP\/1\.[01] (\d{3})/.exec(chunk.toString('latin1'));
        tls.destroy();
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
  return target.protocol === 'https:'
    ? viaConnect(target, proxy, opts.userAgent, timeoutMs)
    : viaHttpProxy(target, proxy, opts.userAgent, timeoutMs);
};
