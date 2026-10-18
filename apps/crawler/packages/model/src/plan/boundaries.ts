/**
 * Process boundary signals and the weighted screen graph (spec 039 design § 13.2–13.3). Pure.
 */
import { compare } from '../model/clustering.js';

/** A value that first appears in a response and later in a request: one process instance's id. */
export interface CorrelationId {
  keyPath: string;
  valueHash: string;
  endpointFamily: string;
  /** Transition seqs of the first and last use within the journey. */
  first: number;
  last: number;
}

export interface CallSighting {
  /** The transition seq the call hangs off. */
  seq: number;
  method: string;
  urlTemplate: string;
  /** The request URL (query kept), for ids passed in the path or query. */
  url: string;
  /** Request and response bodies as JSON values (samples), when kept. */
  request?: unknown;
  response?: unknown;
}

const ID_KEY = /(id|number|nr|numer|uuid)$/i;
const HIGH_ENTROPY = /^[A-Za-z0-9_-]{8,}$/;

/** `/api/quote/:param/price` → `/api/quote/*`: the path up to its first parameter. */
export function endpointFamily(urlTemplate: string): string {
  const parts = urlTemplate.split('/');
  const at = parts.findIndex((p) => p.startsWith(':'));
  return at === -1 ? urlTemplate : `${parts.slice(0, at).join('/')}/*`;
}

function leaves(value: unknown, path: string, out: [string, string][]): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${path}[${i}]`, out));
  else if (typeof value === 'object')
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      leaves(v, `${path}.${k}`, out);
  else out.push([path, String(value)]);
}

const isCandidate = (path: string, value: string): boolean => {
  const key = path
    .split('.')
    .at(-1)!
    .replace(/\[\d+\]$/, '');
  return (ID_KEY.test(key) && value.length >= 1) || (HIGH_ENTROPY.test(value) && /\d/.test(value));
};

/**
 * Correlation ids of one journey (design § 13.2): a candidate value in a response body that a
 * later request carries in its URL or body. `hash` names the value without storing it.
 */
export function correlationIds(
  calls: readonly CallSighting[],
  hash: (value: string) => string,
): CorrelationId[] {
  const ordered = [...calls].sort((a, b) => a.seq - b.seq);
  const out = new Map<string, CorrelationId>();
  ordered.forEach((call, i) => {
    const found: [string, string][] = [];
    leaves(call.response, '$', found);
    for (const [path, value] of found) {
      if (!isCandidate(path, value)) continue;
      const later = ordered.slice(i + 1).filter((c) => {
        const body: [string, string][] = [];
        leaves(c.request, '$', body);
        return c.url.includes(value) || body.some(([, v]) => v === value);
      });
      if (later.length === 0) continue;
      const key = `response:${path}\u0000${value}`;
      if (out.has(key)) continue;
      out.set(key, {
        keyPath: `response:${path}`,
        valueHash: hash(value),
        endpointFamily: endpointFamily(call.urlTemplate),
        first: call.seq,
        last: Math.max(...later.map((c) => c.seq)),
      });
    }
  });
  return [...out.values()].sort((a, b) => a.first - b.first || compare(a.keyPath, b.keyPath));
}

export interface ScreenSignals {
  screen: string;
  /** Micro-frontend scopes its members mount. */
  scopes: readonly string[];
  /** Endpoint families its visits call. */
  families: readonly string[];
  /** Form step chain it belongs to, if any. */
  form: string | null;
}

export interface WeightedEdge {
  a: string;
  b: string;
  w: number;
}

const jaccard = (x: readonly string[], y: readonly string[]): number => {
  const a = new Set(x);
  const b = new Set(y);
  const inter = [...a].filter((v) => b.has(v)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
};

/**
 * The weighted graph Leiden cuts (design § 13.3): over pairs of non-global screens that share a
 * transition or a signal, w = 3 × shared correlation id + 2 × Jaccard(scopes) + 2 × Jaccard(endpoint
 * families) + 1 × same form + 1 × a direct non-global transition.
 */
export function boundaryGraph(
  signals: readonly ScreenSignals[],
  links: ReadonlySet<string>,
  sharedCorrelation: ReadonlySet<string>,
): WeightedEdge[] {
  const pair = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  const sorted = [...signals].sort((a, b) => compare(a.screen, b.screen));
  const out: WeightedEdge[] = [];
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      const k = pair(a.screen, b.screen);
      const w =
        3 * (sharedCorrelation.has(k) ? 1 : 0) +
        2 * jaccard(a.scopes, b.scopes) +
        2 * jaccard(a.families, b.families) +
        (a.form !== null && a.form === b.form ? 1 : 0) +
        (links.has(k) ? 1 : 0);
      if (w > 0) out.push({ a: a.screen, b: b.screen, w: Math.round(w * 1000) / 1000 });
    }
  return out;
}
