/**
 * Every parameter a URL carries, exactly as written (spec 019, R-37). Pure: no I/O.
 *
 * Legacy systems wire screens together through intertwined parameters, so nothing is normalised
 * away: repeated names stay repeated, order is kept, `?flag` (no `=`) is told apart from `?flag=`,
 * tracking parameters and session ids are kept. Path parameters (`/a.do;jsessionid=…`) and the query
 * of a hash route (`#/polisy?nr=7`) count too.
 */

export type UrlParamLocation = 'query' | 'path' | 'fragment_query';

export interface UrlParam {
  name: string;
  /** Decoded value; `null` when the parameter has no `=` at all. */
  value: string | null;
  in: UrlParamLocation;
  /** Position among the parameters of the same location, from 0. */
  position: number;
}

/** Percent-decoding that never throws: a malformed escape keeps the raw text. */
function decode(raw: string, plusIsSpace: boolean): string {
  const text = plusIsSpace ? raw.replace(/\+/g, ' ') : raw;
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function pair(piece: string, plusIsSpace: boolean): { name: string; value: string | null } {
  const eq = piece.indexOf('=');
  if (eq < 0) return { name: decode(piece, plusIsSpace), value: null };
  return {
    name: decode(piece.slice(0, eq), plusIsSpace),
    value: decode(piece.slice(eq + 1), plusIsSpace),
  };
}

function queryParams(search: string, where: UrlParamLocation): UrlParam[] {
  return search
    .split('&')
    .filter((p) => p.length > 0)
    .map((p, position) => ({ ...pair(p, true), in: where, position }));
}

function pathParams(pathname: string): UrlParam[] {
  const out: UrlParam[] = [];
  for (const segment of pathname.split('/')) {
    const [, ...params] = segment.split(';');
    for (const p of params)
      if (p.length > 0) out.push({ ...pair(p, false), in: 'path', position: out.length });
  }
  return out;
}

/** The parameters of `url` in path, query, fragment-query order; `[]` for an unparsable URL. */
export function parseUrlParams(url: string): UrlParam[] {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return [];
  }
  const hashQuery = u.hash.includes('?') ? u.hash.slice(u.hash.indexOf('?') + 1) : '';
  return [
    ...pathParams(u.pathname),
    ...queryParams(u.search.replace(/^\?/, ''), 'query'),
    ...queryParams(hashQuery, 'fragment_query'),
  ];
}
