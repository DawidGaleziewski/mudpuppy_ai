import type { HopKind, NavigationHop, ObservationVia } from '@mudpuppy/core';
import { parseUrlParams, type UrlParamLocation } from '@mudpuppy/fingerprint';

/**
 * Per-screen parameter inventory and entry URLs (spec 019, R-37/R-38), derived from recorded visits
 * alone. Pure: the BA server, the export and the gates call it on rows they read.
 */

/** A recorded visit, as read from `observations` (hops parsed). */
export interface VisitRow {
  id: string;
  state_id: string;
  transition_id: string | null;
  via: ObservationVia;
  url: string;
  hops: NavigationHop[];
}

export interface EntryUrl {
  url: string;
  visits: number;
  via: ObservationVia[];
  /** Hop kinds that led to this URL besides the start (empty: reached directly). */
  hop_kinds: HopKind[];
}

/** Where a parameter value first appeared: the action's edge (if any) and the hop that brought it. */
export interface SetBy {
  transition_id: string | null;
  hop: HopKind;
}

export interface ParamEntry {
  name: string;
  in: UrlParamLocation;
  /** Visits whose URL carries the parameter. */
  visits: number;
  /** Distinct values in first-seen order, at most {@link MAX_VALUES}; `null` = present without `=`. */
  values: (string | null)[];
  distinct: number;
  set_by: SetBy[];
}

export interface StateInventory {
  state_id: string;
  entry_urls: EntryUrl[];
  /** Distinct entry URLs beyond {@link MAX_ENTRY_URLS}. */
  entry_urls_more: number;
  params: ParamEntry[];
}

export const MAX_VALUES = 20;
export const MAX_ENTRY_URLS = 50;

const pushUnique = <T>(list: T[], v: T): void => {
  if (!list.includes(v)) list.push(v);
};

/** How the visit's final URL was reached: the last hop that is not the start. */
function arrivalHop(v: VisitRow): HopKind {
  const last = [...v.hops].reverse().find((h) => h.kind !== 'start' && h.kind !== 'blocked');
  return last?.kind ?? 'navigate';
}

interface ParamAcc {
  entry: ParamEntry;
  seen: Set<string>;
}

function addParams(acc: Map<string, ParamAcc>, v: VisitRow): void {
  const counted = new Set<string>();
  for (const p of parseUrlParams(v.url)) {
    const key = `${p.in}\u0000${p.name}`;
    let a = acc.get(key);
    if (!a) {
      a = {
        entry: { name: p.name, in: p.in, visits: 0, values: [], distinct: 0, set_by: [] },
        seen: new Set(),
      };
      acc.set(key, a);
    }
    if (!counted.has(key)) {
      a.entry.visits += 1;
      counted.add(key);
    }
    const valueKey = p.value === null ? '\u0000null' : p.value;
    if (a.seen.has(valueKey)) continue;
    a.seen.add(valueKey);
    a.entry.distinct += 1;
    if (a.entry.values.length < MAX_VALUES) a.entry.values.push(p.value);
    const by: SetBy = { transition_id: v.transition_id, hop: arrivalHop(v) };
    if (!a.entry.set_by.some((s) => s.transition_id === by.transition_id && s.hop === by.hop))
      a.entry.set_by.push(by);
  }
}

function addEntry(entries: Map<string, EntryUrl>, v: VisitRow): void {
  let e = entries.get(v.url);
  if (!e) {
    e = { url: v.url, visits: 0, via: [], hop_kinds: [] };
    entries.set(v.url, e);
  }
  e.visits += 1;
  pushUnique(e.via, v.via);
  for (const h of v.hops) if (h.kind !== 'start') pushUnique(e.hop_kinds, h.kind);
}

/**
 * The inventory of every state the visits reached, states in first-visit order, parameters in
 * first-seen order (path, query, hash-route query within a URL). Nothing is normalised away:
 * session ids, tracking parameters and repeated names all count.
 */
export function parameterInventory(visits: readonly VisitRow[]): StateInventory[] {
  const byState = new Map<
    string,
    { entries: Map<string, EntryUrl>; params: Map<string, ParamAcc> }
  >();
  for (const v of visits) {
    let s = byState.get(v.state_id);
    if (!s) {
      s = { entries: new Map(), params: new Map() };
      byState.set(v.state_id, s);
    }
    addEntry(s.entries, v);
    addParams(s.params, v);
  }
  return [...byState].map(([state_id, s]) => {
    const entries = [...s.entries.values()];
    return {
      state_id,
      entry_urls: entries.slice(0, MAX_ENTRY_URLS),
      entry_urls_more: Math.max(0, entries.length - MAX_ENTRY_URLS),
      params: [...s.params.values()].map((a) => a.entry),
    };
  });
}
