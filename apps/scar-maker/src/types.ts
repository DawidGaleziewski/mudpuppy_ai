// What a scar module is: the routes that reproduce one real-world obstacle (spec 030 FR-001).

import type { IncomingMessage, ServerResponse } from 'node:http';

/** Which loopback address a request arrived on: the portal or the second (IdP / CDN) host. */
export type HostRole = 'portal' | 'second';

export interface ScarContext {
  host: HostRole;
  /** `http://127.0.0.1:<port>`: the portal host. */
  portal: string;
  /** `http://127.0.0.2:<port>`: the second host (identity provider, CDN). */
  second: string;
  /** The request path without the query. */
  path: string;
  query: URLSearchParams;
  /** The request body, read once for POST requests (form-encoded or text). */
  body: string;
  /** Cookies of the request by name. */
  cookies: Record<string, string>;
  /** Per-server memory a scar may keep (counters, sessions); reset with `/__admin/reset`. */
  memory: Map<string, unknown>;
}

export type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ScarContext,
) => void | Promise<void>;

export interface Scar {
  /** `SC-nn`, the id in `scars.yaml`. */
  id: string;
  /** The page a crawl starts on; linked from the index page. */
  entry: string;
  /** Exact paths (no query) to handlers. */
  routes: Record<string, Handler>;
  /**
   * False keeps the scar off the index page: a scar that ends a run by design (an allowlist 403)
   * would stop the eval's map of the whole portal. Its gate opens it directly.
   */
  inIndex?: boolean;
}
