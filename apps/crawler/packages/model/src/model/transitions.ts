/**
 * Action classes, model transitions, coverage and build epochs (spec 039 design § 6.5–6.7). Pure.
 */
import { MODEL_DEFAULTS } from '../defaults.js';
import { compare } from './clustering.js';

/** The containers that make an action global navigation when they repeat across screens. */
const GLOBAL_CONTAINERS = ['banner', 'navigation', 'contentinfo'];

/** The container path of an element key (`role|name|container|ordinal`). */
export const containerOf = (elementKey: string): string => elementKey.split('|')[2] ?? '';

/**
 * Element keys that are global navigation (design § 6.5): their container starts at a banner,
 * navigation or footer, and the key is on at least `share` of the portal's screens.
 */
export function globalKeys(
  keysByScreen: ReadonlyMap<string, readonly string[]>,
  share: number = MODEL_DEFAULTS.globalNavShare,
): Set<string> {
  const screens = keysByScreen.size;
  const count = new Map<string, number>();
  for (const keys of keysByScreen.values())
    for (const k of new Set(keys)) count.set(k, (count.get(k) ?? 0) + 1);
  const out = new Set<string>();
  for (const [k, n] of count) {
    const top = containerOf(k).split('>')[0]!.split(' ')[0]!;
    if (GLOBAL_CONTAINERS.includes(top) && screens > 0 && n / screens >= share) out.add(k);
  }
  return out;
}

export interface LayerATransition {
  id: string;
  /** Screen of the state it started on. */
  fromScreen: string;
  /** Screen of the state it led to; null when no page resulted (a refusal). */
  toScreen: string | null;
  elementKey: string;
  kind: string;
  result: string;
  /** For first and last sighting: capture order. */
  createdAt: string;
}

export interface ModelTransitionRow {
  key: string;
  fromScreen: string;
  elementKey: string;
  kind: string;
  toScreen: string | null;
  result: string;
  internal: boolean;
  support: number;
  firstSeen: string;
  lastSeen: string;
}

/** The upsert key of a model transition (design § 6.5): ids survive rebuilds through it. */
export const modelTransitionKey = (t: {
  fromScreen: string;
  elementKey: string;
  kind: string;
  toScreen: string | null;
  result: string;
}): string => [t.fromScreen, t.elementKey, t.kind, t.toScreen ?? '', t.result].join('\u0000');

/** Fold Layer A transitions into model transitions: one per key, with support and sightings. */
export function foldTransitions(transitions: readonly LayerATransition[]): ModelTransitionRow[] {
  const byKey = new Map<string, ModelTransitionRow>();
  for (const t of [...transitions].sort(
    (a, b) => compare(a.createdAt, b.createdAt) || compare(a.id, b.id),
  )) {
    const key = modelTransitionKey(t);
    const row = byKey.get(key);
    if (row) {
      row.support += 1;
      row.lastSeen = t.id;
      continue;
    }
    byKey.set(key, {
      key,
      fromScreen: t.fromScreen,
      elementKey: t.elementKey,
      kind: t.kind,
      toScreen: t.toScreen,
      result: t.result,
      internal: t.toScreen === t.fromScreen,
      support: 1,
      firstSeen: t.id,
      lastSeen: t.id,
    });
  }
  return [...byKey.values()].sort((a, b) => compare(a.key, b.key));
}

export type CoverageStatus = 'active' | 'not_seen_since' | 'untested' | 'retired';

/** One run's look at one action class for one audience: was the element on any page of its screen? */
export interface RunLook {
  runId: string;
  /** Capture order of the run (its start time). */
  runAt: string;
  audience: string;
  /** The build epoch the run's observations of the screen were in. */
  epoch: string;
  present: boolean;
  executed: boolean;
}

export interface CoverageState {
  /** Consecutive runs that looked and missed it, per audience, in the current epoch. */
  streak: Map<string, number>;
  status: CoverageStatus;
}

/**
 * Coverage of one action class (design § 6.6). Per run and audience: present in any observation →
 * streak 0; absent in all → streak + 1. Active: present or executed in the current epoch for some
 * audience. Not seen since: absent in ≥ `absentRuns` consecutive runs of the current epoch, for
 * every audience where it was ever present. Untested: its screen not observed in the current epoch
 * for an audience where it was present. Retired: a confirmed `removed` (the caller passes it).
 */
export function coverageOf(
  looks: readonly RunLook[],
  currentEpoch: string,
  retired = false,
  absentRuns: number = MODEL_DEFAULTS.absentRunsForMissing,
): CoverageState {
  const ordered = [...looks].sort((a, b) => compare(a.runAt, b.runAt) || compare(a.runId, b.runId));
  const everPresent = new Set(
    ordered.filter((l) => l.present || l.executed).map((l) => l.audience),
  );
  const streak = new Map<string, number>();
  for (const l of ordered) {
    if (l.epoch !== currentEpoch) continue;
    streak.set(l.audience, l.present || l.executed ? 0 : (streak.get(l.audience) ?? 0) + 1);
  }
  if (retired) return { streak, status: 'retired' };
  // The latest runs decide (F-11@039): missed twice in a row by every audience it was on means
  // not seen since, even when it was present earlier in the same epoch.
  const gone =
    everPresent.size > 0 && [...everPresent].every((a) => (streak.get(a) ?? 0) >= absentRuns);
  if (gone) return { streak, status: 'not_seen_since' };
  const inEpoch = ordered.filter((l) => l.epoch === currentEpoch);
  if (inEpoch.some((l) => l.present || l.executed)) return { streak, status: 'active' };
  return { streak, status: 'untested' };
}

export interface ScopeObservation {
  id: string;
  /** Capture order. */
  at: string;
  scope: string;
  environment: string;
  build: string;
}

export interface BuildEpoch {
  scope: string;
  environment: string;
  build: string;
  firstObservation: string;
  lastObservation: string;
  overlapsPrevious: boolean;
}

/**
 * Build epochs per scope and environment (design § 6.7): a new epoch starts when a new signature
 * appears in two consecutive observations of the scope; when old and new builds then alternate
 * (a canary, a CDN cache) the epochs overlap.
 */
export function buildEpochs(observations: readonly ScopeObservation[]): BuildEpoch[] {
  const groups = new Map<string, ScopeObservation[]>();
  for (const o of observations) {
    const k = `${o.scope}\u0000${o.environment}`;
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const out: BuildEpoch[] = [];
  for (const k of [...groups.keys()].sort(compare)) {
    const obs = groups.get(k)!.sort((a, b) => compare(a.at, b.at) || compare(a.id, b.id));
    const epochs: BuildEpoch[] = [];
    let current: BuildEpoch | null = null;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i]!;
      if (current === null) {
        current = epochOf(o);
        epochs.push(current);
        continue;
      }
      if (o.build === current.build) {
        current.lastObservation = o.id;
        continue;
      }
      const next = obs[i + 1];
      const persists = next !== undefined && next.build === o.build;
      const earlier = epochs.find((e) => e.build === o.build);
      if (earlier) {
        // An old build served again: the switch is gradual.
        earlier.lastObservation = o.id;
        current.overlapsPrevious = true;
        continue;
      }
      if (!persists) continue; // one stray sighting does not start an epoch
      current = { ...epochOf(o), overlapsPrevious: false };
      epochs.push(current);
    }
    out.push(...epochs);
  }
  return out;
}

function epochOf(o: ScopeObservation): BuildEpoch {
  return {
    scope: o.scope,
    environment: o.environment,
    build: o.build,
    firstObservation: o.id,
    lastObservation: o.id,
    overlapsPrevious: false,
  };
}
