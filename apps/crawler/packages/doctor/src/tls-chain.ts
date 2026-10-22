// The certificates an https site presents (spec 031 US4): read without verifying, directly or
// through an HTTP proxy's CONNECT tunnel (as the browser goes), so the doctor can tell whether the
// configured CA file holds one of them. Never throws.

import { X509Certificate } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { Socket } from 'node:net';
import { connect as tlsConnect, type DetailedPeerCertificate } from 'node:tls';
import { spkiHash } from '@mudpuppy/config';
import type { PresentedCert, TlsChainProbe } from './registry.js';

type Result = Awaited<ReturnType<TlsChainProbe>>;

const errorOf = (e: unknown): Result => {
  const err = e as Error & { code?: string };
  return { error: err.message, ...(err.code ? { code: err.code } : {}) };
};

/** Leaf first, then each issuer the server sent (the walk stops at a self-signed one). */
function chainOf(peer: DetailedPeerCertificate): PresentedCert[] {
  const out: PresentedCert[] = [];
  const seen = new Set<string>();
  for (let c: DetailedPeerCertificate | undefined = peer; c?.raw; c = c.issuerCertificate) {
    if (seen.has(c.fingerprint256)) break;
    seen.add(c.fingerprint256);
    const x = new X509Certificate(c.raw);
    out.push({ subject: x.subject.replace(/\n/g, ', '), spki: spkiHash(x) });
  }
  return out;
}

function handshake(target: URL, timeoutMs: number, socket?: Socket): Promise<Result> {
  return new Promise((resolve) => {
    const t = tlsConnect({
      ...(socket ? { socket } : { host: target.hostname, port: Number(target.port || 443) }),
      servername: target.hostname,
      rejectUnauthorized: false,
      timeout: timeoutMs,
    });
    t.on('secureConnect', () => {
      const chain = chainOf(t.getPeerCertificate(true));
      t.destroy();
      resolve({ chain });
    });
    t.on('timeout', () => t.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    t.on('error', (e) => resolve(errorOf(e)));
  });
}

export const tlsChainProbe: TlsChainProbe = (url, opts) => {
  const target = new URL(url);
  const timeoutMs = opts.timeoutMs ?? 10_000;
  if (!opts.proxy) return handshake(target, timeoutMs);
  const proxy = new URL(opts.proxy);
  return new Promise((resolve) => {
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
        resolve({ error: `the proxy answered CONNECT with HTTP ${String(res.statusCode)}` });
        return;
      }
      void handshake(target, timeoutMs, socket).then(resolve);
    });
    req.on('timeout', () =>
      req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })),
    );
    req.on('error', (e) => resolve(errorOf(e)));
    req.end();
  });
};
