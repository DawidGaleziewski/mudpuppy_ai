/**
 * URL → route template inference (research §2). Pure: no I/O, no clock.
 *
 * `normalizeUrl` applies RFC 3986 normalization, strips tracking params, sorts the query and
 * drops fragments (unless hash-routed). `inferRouteTemplates` inserts observed URLs into a trie
 * and collapses dynamic positions to `:param`.
 */

const PARAM = ':param';

const DEFAULT_TRACKING_PARAMS: readonly (string | RegExp)[] = [
  /^utm_/i,
  'gclid',
  'dclid',
  'fbclid',
  'msclkid',
  'yclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  '_ga',
  '_gl',
  'ref_src',
];

export interface NormalizeOptions {
  /** Query params to drop; replaces the default tracking list. Strings match case-insensitively. */
  trackingParams?: readonly (string | RegExp)[];
}

export interface RouteTemplateOptions extends NormalizeOptions {
  /** A position with MORE distinct literal siblings than this collapses to `:param`. Default 10. */
  highCardinality?: number;
}

export interface RouteTemplater {
  /** Route template (path only, no host or query) for a URL; works for URLs not seen at build time. */
  templateFor(url: string): string;
}

const UNRESERVED = /^[A-Za-z0-9\-._~]$/;

function normalizePercentEncoding(s: string): string {
  return s.replace(/%([0-9a-fA-F]{2})/g, (_, hex: string) => {
    const ch = String.fromCharCode(parseInt(hex, 16));
    return UNRESERVED.test(ch) ? ch : `%${hex.toUpperCase()}`;
  });
}

function isTracking(name: string, list: readonly (string | RegExp)[]): boolean {
  return list.some((t) =>
    typeof t === 'string' ? t.toLowerCase() === name.toLowerCase() : t.test(name),
  );
}

function isHashRoute(hash: string): boolean {
  return hash.startsWith('#/') || hash.startsWith('#!/');
}

export function normalizeUrl(input: string, options: NormalizeOptions = {}): string {
  const url = new URL(input); // lowercases scheme/host, drops default ports, resolves dot segments
  const tracking = options.trackingParams ?? DEFAULT_TRACKING_PARAMS;

  let path = normalizePercentEncoding(url.pathname).replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  const pairs = [...url.searchParams.entries()]
    .filter(([k]) => !isTracking(k, tracking))
    .sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0));
  const query = pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const hash = isHashRoute(url.hash) ? normalizePercentEncoding(url.hash) : '';

  return `${url.protocol}//${url.host}${path}${query ? `?${query}` : ''}${hash}`;
}

const NUMERIC = /^\d+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HASH = /^[0-9a-f]{16,}$/i;
const SLUG_WITH_ID = /^.+-\d{5,}$/; // e.g. `lenovo-thinkpad-t480-6501234`

function isDynamicSegment(seg: string): boolean {
  return NUMERIC.test(seg) || UUID.test(seg) || LONG_HASH.test(seg) || SLUG_WITH_ID.test(seg);
}

interface TrieNode {
  children: Map<string, TrieNode>;
}

const newNode = (): TrieNode => ({ children: new Map() });

function child(node: TrieNode, key: string): TrieNode {
  let c = node.children.get(key);
  if (!c) node.children.set(key, (c = newNode()));
  return c;
}

function mergeInto(target: TrieNode, src: TrieNode): void {
  for (const [key, sub] of src.children) mergeInto(child(target, key), sub);
}

/** Segments of the normalized URL's path, followed by `#` and the hash-route path if present. */
function segmentsOf(normalized: string): { host: string; segments: string[] } {
  const url = new URL(normalized);
  const split = (p: string) => p.split('/').filter(Boolean);
  const segments = split(url.pathname);
  if (isHashRoute(url.hash)) segments.push('#', ...split(url.hash.replace(/^#!?/, '')));
  return { host: url.host, segments };
}

function collapse(node: TrieNode, limit: number): TrieNode {
  const out = newNode();
  for (const [seg, sub] of node.children) {
    mergeInto(child(out, seg !== '#' && isDynamicSegment(seg) ? PARAM : seg), sub);
  }
  const literals = [...out.children.keys()].filter((k) => k !== PARAM && k !== '#');
  if (literals.length > limit) {
    const param = child(out, PARAM);
    for (const key of literals) {
      mergeInto(param, out.children.get(key)!);
      out.children.delete(key);
    }
  }
  for (const [key, sub] of out.children) out.children.set(key, collapse(sub, limit));
  return out;
}

export function inferRouteTemplates(
  urls: readonly string[],
  options: RouteTemplateOptions = {},
): RouteTemplater {
  const limit = options.highCardinality ?? 10;
  const normalizeOptions: NormalizeOptions = { trackingParams: options.trackingParams };

  const raw = new Map<string, TrieNode>();
  for (const u of urls) {
    const { host, segments } = segmentsOf(normalizeUrl(u, normalizeOptions));
    let node = raw.get(host);
    if (!node) raw.set(host, (node = newNode()));
    for (const seg of segments) node = child(node, seg);
  }
  const roots = new Map([...raw].map(([host, root]) => [host, collapse(root, limit)]));

  return {
    templateFor(url: string): string {
      const { host, segments } = segmentsOf(normalizeUrl(url, normalizeOptions));
      let node: TrieNode | undefined = roots.get(host);
      const out: string[] = [];
      for (const seg of segments) {
        const dynamic = seg !== '#' && isDynamicSegment(seg);
        const next: TrieNode | undefined = dynamic ? undefined : node?.children.get(seg);
        if (next) {
          out.push(seg);
          node = next;
        } else if (dynamic || node?.children.has(PARAM)) {
          out.push(PARAM);
          node = node?.children.get(PARAM);
        } else {
          out.push(seg);
          node = undefined;
        }
      }
      return `/${out.join('/')}`.replace('/#/', '#/').replace(/\/#$/, '#');
    },
  };
}
