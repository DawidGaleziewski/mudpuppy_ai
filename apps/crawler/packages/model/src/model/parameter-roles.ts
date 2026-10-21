/**
 * Parameter roles and route keys (spec 039 design § 6.4). Each path parameter (`:param` segment) and
 * query parameter of a route template is `identity` (its values show different screens), `data`
 * (values vary, the screen does not) or `ignored` (one value seen). The route key writes identity
 * parameters out: `/sekcja/3`, `/polisa/:param?action=edit`. Pure.
 */
import { compare } from './clustering.js';

export type ParameterRole = 'identity' | 'data' | 'ignored';

export interface ParamObservation {
  routeTemplate: string;
  url: string;
  /** Structure hash of the state the visit showed (`state_components.structure_hash`). */
  structureHash: string;
}

/** `path:<index>` (segment position in the template) or `query:<name>`. */
export type ParamId = string;

/** Each parameter of a URL under its template, with its value. */
export function paramsOf(routeTemplate: string, url: string): Map<ParamId, string> {
  const out = new Map<ParamId, string>();
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return out;
  }
  const tpl = routeTemplate.split('?')[0]!.split('/');
  const segs = u.pathname.split('/');
  tpl.forEach((t, i) => {
    if (t.startsWith(':') && segs[i] !== undefined)
      out.set(`path:${i}`, decodeURIComponent(segs[i]));
  });
  for (const [k, v] of u.searchParams) if (!out.has(`query:${k}`)) out.set(`query:${k}`, v);
  return out;
}

/**
 * Roles per template and parameter. Identity: at least two values each seen two or more times, and
 * the structure hashes of those values never overlap. Data: more than one value otherwise. Ignored:
 * one value. A person's role (`overrides`, keyed `template\u0000param`) always wins.
 */
export function parameterRoles(
  observations: readonly ParamObservation[],
  overrides: ReadonlyMap<string, ParameterRole> = new Map(),
): Map<string, Map<ParamId, ParameterRole>> {
  // template → param → value → { count, structures }
  const seen = new Map<string, Map<ParamId, Map<string, { n: number; structures: Set<string> }>>>();
  for (const o of observations) {
    const byParam = seen.get(o.routeTemplate) ?? new Map();
    seen.set(o.routeTemplate, byParam);
    for (const [param, value] of paramsOf(o.routeTemplate, o.url)) {
      const byValue = byParam.get(param) ?? new Map();
      byParam.set(param, byValue);
      const v = byValue.get(value) ?? { n: 0, structures: new Set<string>() };
      v.n += 1;
      v.structures.add(o.structureHash);
      byValue.set(value, v);
    }
  }
  const out = new Map<string, Map<ParamId, ParameterRole>>();
  for (const [template, byParam] of seen) {
    const roles = new Map<ParamId, ParameterRole>();
    for (const [param, byValue] of byParam) {
      const forced = overrides.get(`${template}\u0000${param}`);
      roles.set(param, forced ?? roleOf([...byValue.values()]));
    }
    out.set(template, roles);
  }
  return out;
}

function roleOf(values: readonly { n: number; structures: ReadonlySet<string> }[]): ParameterRole {
  if (values.length <= 1) return 'ignored';
  const repeated = values.filter((v) => v.n >= 2);
  if (repeated.length >= 2) {
    const all = new Set<string>();
    let disjoint = true;
    for (const v of repeated)
      for (const s of v.structures) {
        if (all.has(s)) disjoint = false;
        all.add(s);
      }
    if (disjoint) return 'identity';
  }
  return 'data';
}

/** The route key of a URL: its template with identity parameters written out (sorted queries). */
export function routeKey(
  routeTemplate: string,
  url: string,
  roles: ReadonlyMap<ParamId, ParameterRole> | undefined,
): string {
  if (!roles) return routeTemplate;
  const params = paramsOf(routeTemplate, url);
  const segs = routeTemplate.split('?')[0]!.split('/');
  const path = segs
    .map((s, i) => (roles.get(`path:${i}`) === 'identity' ? (params.get(`path:${i}`) ?? s) : s))
    .join('/');
  const query = [...params.entries()]
    .filter(([p]) => p.startsWith('query:') && roles.get(p) === 'identity')
    .map(([p, v]) => `${p.slice('query:'.length)}=${v}`)
    .sort(compare);
  return query.length > 0 ? `${path}?${query.join('&')}` : path;
}

/**
 * A state's route key when it was seen under several (design § 6.1 step 1): the most frequent;
 * ties go to the lexically smallest.
 */
export function dominantRouteKey(keys: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || compare(a[0], b[0]))[0]![0];
}
