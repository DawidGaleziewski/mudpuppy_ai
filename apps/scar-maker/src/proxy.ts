// A tiny forward proxy for the network scars (spec 030 R-63, field GC-03/GC-05). Like a corporate
// proxy it forwards absolute-form HTTP requests and tunnels CONNECT (Playwright's own fetches use a
// tunnel even for http), and it reaches the portal from its own egress address, 127.0.0.3: the
// allowlist scar (SC-13) admits only that address, as the field portal admitted only the proxy's IP.

import { createServer, request, type Server } from 'node:http';
import { connect } from 'node:net';

/** The proxy's egress: the one source address the allowlisted portal admits. */
export const PROXY_EGRESS = '127.0.0.3';

export function startProxy(port: number, host = '127.0.0.1'): Promise<Server> {
  const server = createServer((req, res) => {
    let target: URL;
    try {
      target = new URL(req.url ?? '');
    } catch {
      res.writeHead(400, { 'content-type': 'text/plain' });
      res.end('scar proxy: absolute URLs only');
      return;
    }
    const upstream = request(
      target,
      {
        method: req.method,
        headers: { ...req.headers, host: target.host },
        localAddress: PROXY_EGRESS,
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', (e) => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`scar proxy: ${e.message}`);
    });
    req.pipe(upstream);
  });
  server.on('connect', (req, client, head) => {
    const [host, port] = (req.url ?? '').split(':');
    const upstream = connect({ host, port: Number(port), localAddress: PROXY_EGRESS }, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    const drop = (): void => {
      upstream.destroy();
      client.destroy();
    };
    upstream.on('error', drop);
    client.on('error', drop);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
